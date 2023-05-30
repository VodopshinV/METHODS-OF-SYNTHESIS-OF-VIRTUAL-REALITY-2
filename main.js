'use strict';

let convergence, // convergence
    eye_separation, // eye separation
    ratio, // aspect ratio
    view_field; // field of view

let video;
let track;
let texture;
let webCamTexture;
let webCamSurface;

let gl;                         
let surface;                    
let shProgram;                  
let trackball;                  

let point;
let texturePoint;
let scale;

const C = 1;
let timeStamp;

let deltaRotationMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
let alpha = 0,
    beta = 0,
    gamma = 0,
    x,
    y,
    z;
const EPSILON = 0.001;
const MS2S = 1.0 / 1000.0;

function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iTextureBuffer = gl.createBuffer();
    this.count = 0;

    this.BufferData = function (vertices) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

        this.count = vertices.length / 3;
    }

    this.TextureBufferData = function (normals) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STREAM_DRAW);
    }

    this.Draw = function () {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexture, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexture);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.count);
    }

    this.DrawPoint = function () {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
}

function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    this.iAttribVertex = -1;
    this.iAttribTexture = -1;

    this.iTexturePoint = -1;
    this.iscale = -1;
    this.iTMU = -1;

    this.Use = function () {
        gl.useProgram(this.prog);
    }
}

let a, b, c;
let top1, bottom, left, right, near, far;
function draw() {
    
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gyroToMat();
    calcCamParameters();
    
    applyLeftFrustrum();

    let projectionLeft = m4.frustum(left, right, bottom, top1, near, far);

    applyRightFrustrum();

    let projectionRight = m4.frustum(left, right, bottom, top1, near, far);

    let modelView = trackball.getViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.7);

    let gyroMatrix = gyroRotationMatrix();
    let matAccum0 = m4.multiply(gyroMatrix, modelView);
    let translateToPointZero = m4.translation(0, 0, -10);
    let translateToLeft = m4.translation(-0.03, 0, -20);
    let translateToRight = m4.translation(0.03, 0, -20);

    //let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    let matAccumLeft = m4.multiply(translateToLeft, matAccum0);
    let matAccumRight = m4.multiply(translateToRight, matAccum0);

    gl.uniform1i(shProgram.iTMU, 0);
    gl.enable(gl.TEXTURE_2D);
    gl.uniform2fv(shProgram.iTexturePoint, [texturePoint.x, texturePoint.y]);
    gl.uniform1f(shProgram.iscale, -1000.0);

    let projectionNoRotation = m4.perspective(Math.PI / 32, 1, 8, 22);
    let translatetoCenter = m4.translation(-0.5, -0.5, 0);
    let matrixWebCam = m4.multiply(projectionNoRotation,translatetoCenter);
    gl.bindTexture(gl.TEXTURE_2D, webCamTexture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
    );
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, translateToPointZero);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrixWebCam);
    webCamSurface.Draw();
    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(shProgram.iscale, scale);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccumLeft);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projectionLeft);
    gl.colorMask(false, true, true, false);
    surface.Draw();

    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccumRight);
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projectionRight);
    
    gl.colorMask(true, false, false, false);
    surface.Draw();

    gl.colorMask(true, true, true, true);

    point.DrawPoint()
    gyroToMat();
}

function calcCamParameters() {
    let D = document;
    let spans = D.getElementsByClassName("slider-value");
    convergence = 2000.0;
    convergence = D.getElementById("conv").value;
    spans[3].innerHTML = convergence;
    eye_separation = 70.0;
    eye_separation = D.getElementById("eyes").value;
    spans[0].innerHTML = eye_separation;
    ratio = 1.0;
    view_field = Math.PI / 4;
    view_field = D.getElementById("fov").value;
    spans[1].innerHTML = view_field;
    near = 10.0;
    near = D.getElementById("near").value - 0.0;
    spans[2].innerHTML = near;
    far = 20000.0;

    top1 = near * Math.tan(view_field / 2.0);
    bottom = -top1;

    a = ratio * Math.tan(view_field / 2.0) * convergence;

    b = a - eye_separation / 2;
    c = a + eye_separation / 2;

}

function applyLeftFrustrum() {
    left = -b * near / convergence;
    right = c * near / convergence;
}
function playVideoFix(){
    draw();
    window.requestAnimationFrame(playVideoFix);
}

function CreateSphereSurface(r = 0.05) {
    let vertexList = [];
    let lon = -Math.PI;
    let lat = -Math.PI * 0.5;
    while (lon < Math.PI) {
        while (lat < Math.PI * 0.5) {
            let v1 = sphereSurfaceDate(r, lon, lat);
            let v2 = sphereSurfaceDate(r, lon + 0.05, lat);
            let v3 = sphereSurfaceDate(r, lon, lat + 0.05);
            let v4 = sphereSurfaceDate(r, lon + 0.05, lat + 0.05);
            vertexList.push(v1.x, v1.y, v1.z);
            vertexList.push(v2.x, v2.y, v2.z);
            vertexList.push(v3.x, v3.y, v3.z);
            vertexList.push(v3.x, v3.y, v3.z);
            vertexList.push(v4.x, v4.y, v3.z);
            vertexList.push(v2.x, v2.y, v3.z);
            lat += 0.05;
        }
        lat = -Math.PI * 0.5
        lon += 0.05;
    }
    return vertexList;
}

function sphereSurfaceDate(r, u, v) {
    let x = r * Math.sin(u) * Math.cos(v);
    let y = r * Math.sin(u) * Math.sin(v);
    let z = r * Math.cos(u);
    return { x: x, y: y, z: z };
}
function CreateSurfaceData() {
    let vertexList = [];
    let uMax = Math.PI * 2
    let vMax = Math.PI
    let step = 0.05;

    for (let u = 0; u < uMax*2; u += step) {
        for (let v = 0; v < vMax; v += step) {
            let v1 = sieverts(u, v)
            let v2 = sieverts(u + step, v)
            let v3 = sieverts(u, v + step)
            let v4 = sieverts(u + step, v + step)
            vertexList.push(v1.x, v1.y, v1.z)
            vertexList.push(v2.x, v2.y, v2.z)
            vertexList.push(v3.x, v3.y, v3.z)
            vertexList.push(v3.x, v3.y, v3.z);
            vertexList.push(v4.x, v4.y, v4.z);
            vertexList.push(v2.x, v2.y, v2.z);
        }
    }

    return vertexList;
}

function CreateTexture() {
    let texture = [];
    let uMax = Math.PI * 2
    let vMax = Math.PI
    let step = 0.05;
    
    let uStep = map(step, 0, uMax*2, 0, 1)
    let vStep = map(step, 0, vMax, 0, 1)
    
    for (let u = 0; u < uMax*2; u += step) {
        for (let v = 0; v < vMax; v += step) {
            let u1 = map(u, 0,uMax*2, 0, 1)
            let v1 = map(v, 0, vMax, 0, 1)
            texture.push(u1, v1)
            texture.push(u1 +uStep, v1)
            texture.push(u1, v1 + vStep)
            texture.push(u1, v1 + vStep)
            texture.push(u1 + uStep, v1 + vStep)
            texture.push(u1 + uStep, v1)
        }
    }

    return texture;
}

function map(val, f1, t1, f2, t2) {
    let m;
    m = (val - f1) * (t2 - f2) / (t1 - f1) + f2
    return Math.min(Math.max(m, f2), t2);
}

function sieverts(u,v){
    let x = r(u,v)*Math.cos(fi(u))
    let y = r(u,v)*Math.sin(fi(u))
    let z = (Math.log(v/2)+ass(u,v)*(C+1)*Math.cos(v))/Math.sqrt(C)
    return {x:0.5*x, y:0.5*y, z:0.5*z}
}

function fi(u){
    return (-u/(C+1)+Math.atan(Math.sqrt(C+1)*Math.tan(u)))
}

function ass(u,v){
    return (2/(C+1-C*Math.sin(v)**2*Math.cos(u)**2))
}

function r(u,v){
    return ((ass(u,v)/Math.sqrt(C))*Math.sqrt((C+1)*(1+C*Math.sin(u)**2))*Math.sin(v))
}
function initGL() {
    
    readGyroscope();
    gyroToMat();
    
    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribTexture = gl.getAttribLocation(prog, "texture");
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iProjectionMatrix = gl.getUniformLocation(prog, "ProjectionMatrix");
    shProgram.iTranslatePoint = gl.getUniformLocation(prog, 'translatePoint');
    shProgram.iTexturePoint = gl.getUniformLocation(prog, 'texturePoint');
    shProgram.iscale = gl.getUniformLocation(prog, 'scale');
    shProgram.iTMU = gl.getUniformLocation(prog, 'tmu');

    surface = new Model('Surface');
    surface.BufferData(CreateSurfaceData());
    LoadTexture()
    surface.TextureBufferData(CreateTexture());
    point = new Model('Point');
    point.BufferData(CreateSphereSurface())

    webCamSurface = new Model('webCamSurface');
    webCamSurface.BufferData([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0]);
    webCamSurface.TextureBufferData([0,1,1,1,1,0,1,0,0,0,0,1]);

    gl.enable(gl.DEPTH_TEST);
}

function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
    }
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}
function init() {

    requestDeviceOrientationPermission();
    
    texturePoint = { x: 0.5, y: 0.5 }
    scale = 1.0;
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        video = document.createElement('video');
        video.setAttribute('autoplay', true);
        video.setAttribute('playsinline', true);
        video.setAttribute('muted', true);
        video.style.opacity = 0; // Make video element invisible
        window.vid = video;
        getWebcam();
        CreateWebCamTexture();
        if (!gl) {
            throw "Browser does not support WebGL";
        }
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    trackball = new TrackballRotator(canvas, draw, 0);

    setInterval(draw, 1000 / 60); // Call 'draw' 60 times per second (adjust the value as needed)
    //playVideoFix()
}

function getWebcam() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then(function (stream) {
                video.srcObject = stream;
                track = stream.getTracks()[0];
                video.play();
            })
            .catch(function (e) {
                console.error("Rejected!", e);
            });
    } else if (navigator.webkitGetUserMedia) {
        navigator.webkitGetUserMedia(
            { video: true, audio: false },
            function (stream) {
                video.srcObject = stream;
                track = stream.getTracks()[0];
                video.play();
            },
            function (e) {
                console.error("Rejected!", e);
            }
        );
    } else {
        console.error("WebRTC is not supported in this browser.");
    }
}

function CreateWebCamTexture() {
    webCamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, webCamTexture);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function LoadTexture() {
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const image = new Image();
    image.crossOrigin = 'anonymus';

    image.src = "https://VodopshinV.github.io/METHODS-OF-SYNTHESIS-OF-VIRTUAL-REALITY/Texture.jpeg";
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image
        );
        draw()
    }
}

onmousemove = (e) => {
    scale = map(e.clientX, 0, window.outerWidth, 0, Math.PI)
    draw()
};

function applyRightFrustrum() {
    left = -c * near / convergence;
    right = b * near / convergence;
}


/*function readGyroscope() {
    if (window.DeviceOrientationEvent) {
        timeStamp = Date.now();
        let sensor = new Gyroscope({
            frequency: 60
        });
        sensor.addEventListener('reading', e => {
            x = sensor.x
            y = sensor.y
            z = sensor.z
        });
        sensor.start();
    } else alert('Gyroscope not supported');

}*/

function readGyroscope() {
    if (window.DeviceOrientationEvent) {
        timeStamp = Date.now();
        window.addEventListener("deviceorientation", function (event) {
            // Convert degrees to radians
            alpha = (event.alpha * Math.PI) / 180;
            beta = (event.beta * Math.PI) / 180;
            gamma = (event.gamma * Math.PI) / 180;
        });
    } else {
        alert("DeviceOrientationEvent is not supported");
    }

    if (window.DeviceMotionEvent) {
        window.addEventListener("devicemotion", function (event) {
            x = event.rotationRate.alpha;
            y = event.rotationRate.beta;
            z = event.rotationRate.gamma;
        });
    } else {
        alert("DeviceMotionEvent is not supported");
    }
}

function gyroToMat() {
    if (x != null) {
        let dT = (Date.now() - timeStamp) * MS2S;
        let omegaMagnitude = Math.sqrt(x * x, y * y, z * z);
        if (omegaMagnitude > EPSILON) {
            alpha += x * dT
            beta += y * dT
            gamma += z * dT
            alpha = Math.min(Math.max(alpha, -Math.PI * 0.25), Math.PI * 0.25)
            beta = Math.min(Math.max(beta, -Math.PI * 0.25), Math.PI * 0.25)
            gamma = Math.min(Math.max(gamma, -Math.PI * 0.25), Math.PI * 0.25)

            let deltaRotationVector = [];

            deltaRotationVector.push(alpha);
            deltaRotationVector.push(beta);
            deltaRotationVector.push(gamma);

            deltaRotationMatrix = getRotationMatrixFromVector(deltaRotationVector)

            timeStamp = Date.now();
        }
    }
}

function getRotationMatrixFromVector(rotationVector) {
    const q1 = rotationVector[0];
    const q2 = rotationVector[1];
    const q3 = rotationVector[2];
    let q0;

    if (rotationVector.length >= 4) {
        q0 = rotationVector[3];
    } else {
        q0 = 1 - q1 * q1 - q2 * q2 - q3 * q3;
        q0 = q0 > 0 ? Math.sqrt(q0) : 0;
    }
    const sq_q1 = 2 * q1 * q1;
    const sq_q2 = 2 * q2 * q2;
    const sq_q3 = 2 * q3 * q3;
    const q1_q2 = 2 * q1 * q2;
    const q3_q0 = 2 * q3 * q0;
    const q1_q3 = 2 * q1 * q3;
    const q2_q0 = 2 * q2 * q0;
    const q2_q3 = 2 * q2 * q3;
    const q1_q0 = 2 * q1 * q0;
    let R = [];
    R.push(1 - sq_q2 - sq_q3);
    R.push(q1_q2 - q3_q0);
    R.push(q1_q3 + q2_q0);
    R.push(0.0);
    R.push(q1_q2 + q3_q0);
    R.push(1 - sq_q1 - sq_q3);
    R.push(q2_q3 - q1_q0);
    R.push(0.0);
    R.push(q1_q3 - q2_q0);
    R.push(q2_q3 + q1_q0);
    R.push(1 - sq_q1 - sq_q2);
    R.push(0.0);
    R.push(0.0);
    R.push(0.0);
    R.push(0.0);
    R.push(1.0);
    return R;
}

function requestDeviceOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then(function (permissionState) {
                if (permissionState === "granted") {
                    readGyroscope();
                } else {
                    alert("Device orientation permission not granted");
                }
            })
            .catch(function (error) {
                console.error("Error requesting device orientation permission:", error);
            });
    } else if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission()
            .then(function (permissionState) {
                if (permissionState === "granted") {
                    readGyroscope();
                } else {
                    alert("Device motion permission not granted");
                }
            })
            .catch(function (error) {
                console.error("Error requesting device motion permission:", error);
            });
    } else {
        // No requestPermission function, so we assume permission is granted by default (non-iOS 13+)
        readGyroscope();
    }
}

function gyroRotationMatrix() {
    let xRotation = m4.rotationX(beta);  // beta from gyroscope
    let yRotation = m4.rotationY(alpha); // alpha from gyroscope
    let zRotation = m4.rotationZ(gamma); // gamma from gyroscope

    return m4.multiply(m4.multiply(zRotation, yRotation), xRotation);
}
