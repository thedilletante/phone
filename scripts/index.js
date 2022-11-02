const ws = new WebSocket('wss://phone-simple-signalling.herokuapp.com');
const originalSend = ws.send.bind(ws);
ws.send = msg => {
    console.log("sending", msg);
    return originalSend(msg);
}

async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

const pc = new RTCPeerConnection({
    iceServers:[
        {
            urls: "stun:stun.l.google.com:19302",
        },
    ]
});
pc.onconnectionstatechange = () => {
    switch (pc.connnectionState) {
        case "connected":
        case "failed":
        case "disconnected":
            ws.close();
            break;
    }
    console.log('connection state', pc.connectionState);
};
pc.onicecandidate = e => {
    console.log("ice candidate", e);
    if (e.candidate !== null) {
        ws.send(JSON.stringify({
            operation: "icecandidate",
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
            usernameFragment: e.candidate.usernameFragment,
        }));
    }
};

pc.ontrack = e => {
    console.log('track', e);
    const remoteVideo = document.getElementById('remoteVideo');
    remoteVideo.srcObject = e.streams[0];
}

async function main() {
     //Autoconnect when given a peer id, i.e. #someid
    const initialHash = window.location.hash.substr(1);

    const stream = await getUserMedia();
    for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
    }
    if (initialHash) {
        ws.send(JSON.stringify({
            role: "callee",
            callId: initialHash
        }));
    } else {
        const offer = await pc.createOffer();
        ws.send(JSON.stringify({
            role: "caller",
            operation: "offer",
            sdp: offer.sdp,
        }));
        console.log('set local description', offer);
        await pc.setLocalDescription(offer);
    }
}

function processMessage(msg) {
    console.log("receiving", msg);
    if (msg.callId) {
        window.location.hash = '#' + msg.callId;
        return;
    }
    switch (msg.operation) {
        case "offer":
            console.log('set remote description', msg.sdp);
            pc.setRemoteDescription({
                type: "offer",
                sdp: msg.sdp,
            }).then(() => pc.createAnswer())
            .then(answer => {
                ws.send(JSON.stringify({
                    operation: "answer",
                    sdp: answer.sdp
                }));
                return pc.setLocalDescription(answer);
            });
            break;
        case "answer":
            pc.setRemoteDescription({
                type: "answer",
                sdp: msg.sdp,
            });
            break;
        case "icecandidate":
            pc.addIceCandidate(msg);
            break;
    }

}

ws.addEventListener("message", e => {
    try {
        processMessage(JSON.parse(e.data));
    } catch (err) {
        console.log("failed to process message", err, e.data);
    }

});

main().catch(console.error);
