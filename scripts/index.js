async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

const applyBtn = document.getElementById('btnApplyRemoteState');
const remoteStateInput = document.getElementById('remoteState');

const localMediaState = {
    sdp: "",
    candidates: []
};
let fillCandidates = true;

const pc = new RTCPeerConnection({
    iceServers:[
        {
            urls: "stun:stun.l.google.com:19302",
        },
    ]
});
pc.onconnectionstatechange = () => {
    switch (pc.connectionState) {
        case "connected":
        case "failed":
        case "disconnected":
        case "closed": {
            stopGathering();
            break;
        }
    }
    console.log('connection state', pc.connectionState);
};
pc.onicecandidate = e => {
    console.log("ice candidate", e);
    if (fillCandidates && e.candidate !== null) {
        localMediaState.candidates.push({
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
            usernameFragment: e.candidate.usernameFragment,
        });
    }
};

pc.ontrack = e => {
    console.log('track', e);
    const remoteVideo = document.getElementById('remoteVideo');
    remoteVideo.srcObject = e.streams[0];
}

function waitGatheringComplete(pc) {
    return new Promise(resolve => {
        let count = 0;
        const listener = e => {
            if (e.candidate === null) {
                pc.removeEventListener("icecandidate", listener);
                resolve();
            }
        };

        pc.addEventListener("icecandidate", listener);
    });
}

function compress(data) {
    //return encodeURIComponent(btoa(JSON.stringify(data)));
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}

function decompress(data) {
    //return JSON.parse(atob(decodeURIComponent(data)));
    return JSON.parse(LZString.decompressFromEncodedURIComponent(data));
}

async function main() {
     //Autoconnect when given a peer id, i.e. #someid
    const initialHash = window.location.hash.substr(1);

    const stream = await getUserMedia();
    for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
    }
    if (initialHash) {
        applyBtn.disabled = true;
        remoteStateInput.disabled = true;
        remoteStateInput.value = initialHash;
        const remoteState = decompress(initialHash);
        console.log('set remote description', remoteState.sdp);
        await pc.setRemoteDescription({
            type: 'offer',
            sdp: remoteState.sdp
        });
        const answer = await pc.createAnswer();
        console.log('set local description', answer);
        await pc.setLocalDescription(answer);
        localMediaState.sdp = answer.sdp;
        for (const candidate of remoteState.candidates) {
            console.log('add ice candidate', candidate);
            await pc.addIceCandidate(candidate);
        }
        await waitGatheringComplete(pc);
        const hash = compress(localMediaState);
        document.getElementById('localState').value = hash;
        document.getElementById('btnCopyLocalState').disabled = false;
    } else {
        const offer = await pc.createOffer();
        localMediaState.sdp = offer.sdp;
        console.log('set local description', offer);
        await pc.setLocalDescription(offer);
        await waitGatheringComplete(pc);
        const hash = compress(localMediaState);
        window.location.hash = '#' + hash;
        document.getElementById('localState').value = hash;
        document.getElementById('btnCopyLocalState').disabled = false;
        fillCandidates = false;
        continueGathering();
    }
}



function copyLocalState() {
  // Get the text field
  const copyText = document.getElementById("localState");

  // Select the text field
  copyText.select();
  copyText.setSelectionRange(0, 99999); // For mobile devices

   // Copy the text inside the text field
  navigator.clipboard.writeText(copyText.value);
}

let gatheringEnabled = false;
let gatheringListener = undefined;
let gatheringResolver = undefined;


function continueGathering() {
    gatheringEnabled = true;
    pc.createAnswer()
        .then(offer => {
            if (!gatheringEnabled) {
                return;
            }
            console.log("set local description again");
            return pc.setLocalDescription(offer);
        }).then(() => {
            if (!gatheringEnabled) {
                return;
            }

            console.log("wait for new candidates");
            return new Promise(resolve => {
                gatheringResolver = resolve;
                gatheringListener = e => {
                    if (e.candidate === null) {
                        pc.removeEventListener("icecandidate", gatheringListener);
                        if (gatheringResolver) {
                            gatheringResolver();
                            gatheringResolver = undefined;
                        }
                    }
                };

                pc.addEventListener("icecandidate", gatheringListener);
            });
        }).then(() => {
            gatheringResolver = undefined;
            gatheringListener = undefined;
            console.log("continue gathering", gatheringEnabled);
            if (!gatheringEnabled) {
                return;
            }

            continueGathering();
        });
}

function stopGathering() {
    gatheringEnabled = false;
    if (typeof gatheringListener !== "undefined") {
        pc.removeEventListener("icecandidate", gatheringListener);
        gatheringListener = undefined;
    }
    if (typeof gatheringResolver !== "undefined") {
        gatheringResolver();
        gatheringResolver = undefined;
    }
}


applyBtn.onclick = () => {
    const stateValue = remoteStateInput.value;
    const remoteState = decompress(stateValue);

    console.log('set remote description', remoteState.sdp);
    applyBtn.disabled = true;
    remoteStateInput.disabled = true;
    pc.setRemoteDescription({
        type: 'answer',
        sdp: remoteState.sdp,
    }).then(async () => {
        for (const candidate of remoteState.candidates) {
            console.log('add ice candidate', candidate);
            await pc.addIceCandidate(candidate);
        }
    });
};

remoteStateInput.onkeyup = () => {
    applyBtn.disabled = remoteStateInput.value.trim() === "";
};


main().catch(console.error);
