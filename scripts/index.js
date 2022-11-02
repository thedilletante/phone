const ws = new WebSocket('wss://phone-simple-signalling.herokuapp.com');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
function send(msg) {
    console.log("sending", msg);
    return ws.send(JSON.stringify(msg));
}
ws.addEventListener("message", e => {
    try {
        processMessage(JSON.parse(e.data));
    } catch (err) {
        console.log("failed to process message", err, e.data);
    }

});
async function waitConnected() {
    return new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
    });
}


async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    localVideo.srcObject = stream;
    return stream;
}

let pc = undefined;
let remoteDescriptionAdded = false;
const pendingCandidates = [];

function createPeerConnection(stream) {
    pc = new RTCPeerConnection({
        iceServers:[
            {
                urls: "stun:stun.l.google.com:19302",
            },
        ]
    });
    for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
    }

    pc.onconnectionstatechange = () => {
        switch (pc.connnectionState) {
            case "connected":
            case "failed":
            case "disconnected":
                console.log("closing webcoket");
                ws.close();
                break;
        }
        console.log('connection state', pc.connectionState);
    };
    pc.onicecandidate = e => {
        console.log("ice candidate", e);
        if (e.candidate !== null) {
            send({
                operation: "icecandidate",
                candidate: e.candidate.candidate,
                sdpMid: e.candidate.sdpMid,
                sdpMLineIndex: e.candidate.sdpMLineIndex,
                usernameFragment: e.candidate.usernameFragment,
            });
        }
    };

    pc.ontrack = e => {
        console.log('track', e);
        remoteVideo.srcObject = e.streams[0];
    }

    return pc;
}

function addPendingCandidates() {
    for (const candidate of pendingCandidates) {
        pc.addIceCandidate(candidate);
    }
}

let callId = undefined;
async function main() {
    await waitConnected();
     //Autoconnect when given a peer id, i.e. #someid
    const initialHash = window.location.hash.substr(1);

    if (initialHash) {
        callId = initialHash;
        send({
            role: "callee",
            callId: initialHash,
            operation: "calling",
        });
    } else {
        send({
            role: "caller",
        });
    }
}

function processMessage(msg) {
    console.log("receiving", msg);
    if (typeof callId === "undefined") {
        if (typeof msg.callId != "undefined") {
            callId = msg.callId;
            window.location.hash = '#' + msg.callId;
        } else {
            console.log("unexpected message");
        }
        return;
    }
    switch (msg.operation) {
        case "calling":
            console.log("getting user media");
            getUserMedia().then(stream => createPeerConnection(stream).createOffer()).then(offer => {
                send({
                    operation: "offer",
                    sdp: offer.sdp,
                });
                console.log('set local description', offer);
                return pc.setLocalDescription(offer);
            });
            break;
        case "offer":
            console.log('set remote description', msg.sdp);
            getUserMedia().then(stream => createPeerConnection(stream).setRemoteDescription({
                type: "offer",
                sdp: msg.sdp,
            })).then(() => {
                remoteDescriptionAdded = true;
                addPendingCandidates();
                return pc.createAnswer();
            }).then(answer => {
                send({
                    operation: "answer",
                    sdp: answer.sdp
                });
                return pc.setLocalDescription(answer);
            });
            break;
        case "answer":
            pc.setRemoteDescription({
                type: "answer",
                sdp: msg.sdp,
            }).then(() => {
                remoteDescriptionAdded = true;
                addPendingCandidates();
            });
            break;
        case "icecandidate":
            if (pc && remoteDescriptionAdded) {
                pc.addIceCandidate(msg);
            } else {
                pendingCandidates.push(msg);
            }
            break;
    }

}

main().catch(err => console.error(err));
