async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

const applyBtn = document.getElementById('btnApplyRemoteState');
const remoteStateInput = document.getElementById('remoteState');

const localMediaState = {
    offer: {},
    answer: {},
    candidates: []
};

const pc = new RTCPeerConnection({
    iceServers:[
        {
            urls: "stun:stun.l.google.com:19302",
        },
    ]
});
pc.onconnectionstatechange = () => console.log('connection state', pc.connectionState);
pc.onicecandidate = e => {
    if (e.candidate !== null) {
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
        console.log('set remote description', remoteState.offer);
        await pc.setRemoteDescription(remoteState.offer);
        const answer = await pc.createAnswer();
        console.log('set local description', answer);
        await pc.setLocalDescription(answer);
        localMediaState.answer = {
            type: answer.type,
            sdp: answer.sdp,
        };
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
        localMediaState.offer = {
            type: offer.type,
            sdp: offer.sdp,
        };
        console.log('set local description', offer);
        await pc.setLocalDescription(offer);
        await waitGatheringComplete(pc);
        const hash = compress(localMediaState);
        window.location.hash = '#' + hash;
        document.getElementById('localState').value = hash;
        document.getElementById('btnCopyLocalState').disabled = false;
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


applyBtn.onclick = () => {
    const stateValue = remoteStateInput.value;
    const remoteState = decompress(stateValue);

    console.log('set remote description', remoteState.answer);
    applyBtn.disabled = true;
    remoteStateInput.disabled = true;
    pc.setRemoteDescription(remoteState.answer).then(async () => {
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
