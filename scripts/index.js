async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

getUserMedia().then(stream => {
    console.log('adding stream', stream);
});
