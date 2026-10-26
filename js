let model, webcam, maxPredictions;
let isCamRunning = false;
let port = null;
let writer = null;
let lastSentClass = ""; // 중복 전송 방지용 변수

// 시스템 로그 기록
function log(message) {
    const logBox = document.getElementById('log-box');
    const now = new Date().toLocaleTimeString();
    logBox.innerHTML += `[${now}] ${message}<br>`;
    logBox.scrollTop = logBox.scrollHeight;
}

// 1. Teachable Machine 모델 로드
async function loadModel() {
    let modelURL = document.getElementById('model-url').value.trim();
    if (!modelURL) {
        alert("Teachable Machine 모델 URL을 입력해주세요.");
        return;
    }

    if (!modelURL.endsWith("/")) modelURL += "/";
    const URL = modelURL;
    const modelPath = URL + "model.json";
    const metadataPath = URL + "metadata.json";

    document.getElementById('model-status').innerText = "모델 로딩 중...";

    try {
        model = await tmImage.load(modelPath, metadataPath);
        maxPredictions = model.getTotalClasses();
        document.getElementById('model-status').innerText = "✅ 모델 로드 완료! (클래스 수: " + maxPredictions + ")";
        log("AI 모델이 성공적으로 로드되었습니다.");

        // 라벨 컨테이너 초기화
        const labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        for (let i = 0; i < maxPredictions; i++) {
            const classTitle = model.getClassLabels()[i];
            labelContainer.innerHTML += `
                <div class="prob-item">
                    <div class="prob-label">
                        <span>${classTitle}</span>
                        <span id="prob-text-${i}">0%</span>
                    </div>
                    <div class="prob-bar-bg">
                        <div id="prob-bar-${i}" class="prob-bar-fill"></div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error(error);
        document.getElementById('model-status').innerText = "❌ 로드 실패. URL을 확인하세요.";
        alert("모델을 불러오는데 실패했습니다. URL을 다시 확인해주세요.");
        log("모델 로드 실패: " + error.message);
    }
}

// 2. Web Serial 통신 (마이크로비트 연결)
async function connectSerial() {
    if (!("serial" in navigator)) {
        alert("이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome 브라우저를 사용해 주세요.");
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        
        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();

        document.getElementById('serial-status').innerText = "연결됨";
        document.getElementById('serial-status').className = "status-badge connected";
        document.getElementById('btn-connect').style.display = "none";
        document.getElementById('btn-disconnect').style.display = "block";
        log("마이크로비트 USB 연결 성공 (115200 bps)");
    } catch (error) {
        console.error(error);
        log("마이크로비트 연결 실패: " + error.message);
    }
}

async function disconnectSerial() {
    if (writer) {
        await writer.close();
        writer = null;
    }
    if (port) {
        await port.close();
        port = null;
    }
    document.getElementById('serial-status').innerText = "연결 안됨";
    document.getElementById('serial-status').className = "status-badge";
    document.getElementById('btn-connect').style.display = "block";
    document.getElementById('btn-disconnect').style.display = "none";
    log("마이크로비트 연결 해제 완료");
}

async function sendSerial(data) {
    if (!writer) {
        log("시리얼 미연결로 전송 스킵: " + data.trim());
        return;
    }
    try {
        await writer.write(data);
        log("전송 성공 -> 마이크로비트: " + data.trim());
    } catch (error) {
        log("전송 오류: " + error.message);
    }
}

// 3. 입력 방식 전환 및 카메라 제어
function switchInputMode() {
    const mode = document.getElementById('input-mode').value;
    if (mode === 'camera') {
        document.getElementById('camera-section').style.display = 'block';
        document.getElementById('image-section').style.display = 'none';
    } else {
        stopCamera();
        document.getElementById('camera-section').style.display = 'none';
        document.getElementById('image-section').style.display = 'block';
    }
}

async function toggleCamera() {
    if (isCamRunning) {
        stopCamera();
    } else {
        await startCamera();
    }
}

async function startCamera() {
    if (!model) {
        alert("먼저 AI 모델을 불러와 주세요!");
        return;
    }

    try {
        const flip = true;
        webcam = new tmImage.Webcam(280, 280, flip);
        await webcam.setup();
        await webcam.play();
        window.requestAnimationFrame(loop);

        document.getElementById("webcam-container").innerHTML = "";
        document.getElementById("webcam-container").appendChild(webcam.canvas);
        document.getElementById("btn-toggle-cam").innerText = "카메라 중지";
        document.getElementById("btn-toggle-cam").className = "btn-danger";
        isCamRunning = true;
        log("실시간 카메라가 시작되었습니다.");
    } catch (error) {
        alert("카메라에 접근할 수 없습니다.");
        log("카메라 오류: " + error.message);
    }
}

function stopCamera() {
    if (webcam) {
        webcam.stop();
        document.getElementById("webcam-container").innerHTML = `<span style="color: #94a3b8;">카메라가 꺼져 있습니다.</span>`;
    }
    document.getElementById("btn-toggle-cam").innerText = "카메라 시작";
    document.getElementById("btn-toggle-cam").className = "";
    isCamRunning = false;
    log("카메라가 중지되었습니다.");
}

async function loop() {
    if (isCamRunning) {
        webcam.update();
        await predict(webcam.canvas);
        window.requestAnimationFrame(loop);
    }
}

// 4. 이미지 파일 업로드 분석
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('uploaded-image');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('img-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

async function predictUploadedImage() {
    if (!model) {
        alert("먼저 AI 모델을 불러와 주세요!");
        return;
    }
    const img = document.getElementById('uploaded-image');
    if (!img.src || img.style.display === 'none') {
        alert("분석할 이미지를 업로드해주세요.");
        return;
    }
    await predict(img);
}

// 5. 핵심 AI 분석 및 판단
async function predict(imageElement) {
    if (!model) return;

    const prediction = await model.predict(imageElement);
    let highestProb = 0;
    let highestClass = "";

    const threshold = parseFloat(document.getElementById('threshold').value) / 100;

    for (let i = 0; i < maxPredictions; i++) {
        const prob = prediction[i].probability;
        const probPercent = Math.round(prob * 100);
        
        document.getElementById(`prob-text-${i}`).innerText = probPercent + "%";
        document.getElementById(`prob-bar-${i}`).style.width = probPercent + "%";

        if (prob > highestProb) {
            highestProb = prob;
            highestClass = prediction[i].className;
        }
    }

    const resultDisplay = document.getElementById('result-display');

    // 신뢰도 기준 충족 여부 확인
    if (highestProb >= threshold) {
        resultDisplay.innerText = `판단: ${highestClass} (${Math.round(highestProb * 100)}%)`;
        
        if (highestClass === 'right') {
            resultDisplay.className = "right";
        } else if (highestClass === 'wrong') {
            resultDisplay.className = "wrong";
        } else {
            resultDisplay.className = "";
        }

        // 중복 전송 방지: 이전 전송 클래스와 다를 때만 마이크로비트로 전송
        if (highestClass !== lastSentClass) {
            lastSentClass = highestClass;
            sendSerial(highestClass + "\n");
        }
    } else {
        resultDisplay.innerText = `신뢰도 미달 (${Math.round(highestProb * 100)}% < ${threshold * 100}%)`;
        resultDisplay.className = "";
    }
}
