const RTCPeerConnection = require('wrtc').RTCPeerConnection;
const RTCSessionDescription = require('wrtc').RTCSessionDescription;
const RTCIceCandidate = require('wrtc').RTCIceCandidate;
const WebSocket = require("ws");
const ffmpegStream = require('./ffmpegStreams')
var peerConnection_localConfig = {
    'iceServers': [
        {
            urls: 'turn:localhost:9001',
            username: "hnguyen48206",
            credential: "123456"
        }
    ]
};
module.exports = class nodewrtc {
    clientID;
    serverID;
    serverConnection;
    isSocketOpened;
    peerConnection_local;
    getChannel;
    sendChannel;
    streamURL;
    myFFStream;
    streamHasInited;
    sendChannelReady;
    cachedLast5Frames;
    constructor(clientID, streamURL) {
        this.streamHasInited = false
        this.sendChannelReady = false;
        this.clientID = clientID;
        this.serverID = clientID + '_server';
        this.streamURL = streamURL;
        this.serverConnection = new WebSocket('ws://localhost:9000');
        this.serverConnection.onmessage = this.gotMessageFromServer;
        this.serverConnection.onclose = () => {
            this.serverConnection.close();
        };
        this.serverConnection.onopen = () => {
            this.login();
        };
        this.cachedLast5Frames=[]
    }
    login = () => {
        this.sendMessageToServer({
            type: "login",
            name: this.serverID
        })
    }
    sendMessageToServer = (data) => {
        this.serverConnection.send(JSON.stringify(data));
    }
    gotMessageFromServer = (message) => {
        // console.log('Message from server ', message)
        const data = JSON.parse(message.data);
        if (data) {
            switch (data.type) {
                case "connect":
                    this.isSocketOpened = true;
                    console.log('Socket Connected')
                    break;
                case "login":
                    this.onLogin(data);
                    break;
                case "removeUser":
                    // this.removeUser(data);
                    break;
                case "offer":
                    this.onOffer(data);
                    break;
                case "answer":
                    this.onAnswer(data);
                    break;
                case "candidate":
                    this.onCandidate(data);
                    break;
                default:
                    break;
            }
        }
    }
    onLogin = (data) => {
        if (data.success) {
            //Start WebRTC
            console.log('Login OK ', data)
            this.initWebRTCLocal();
        }
        else {
            console.log('Login Fail ', data.message)
        }
    }
    getServerClientInfo = () => {
        return {
            clientID: this.clientID,
            serverID: this.serverID,
        }
    }
    initWebRTCLocal = () => {
        this.peerConnection_local = new RTCPeerConnection(peerConnection_localConfig);
        //when the browser finds an ice candidate we send it to another peer
        this.peerConnection_local.onicecandidate = ({ candidate }) => {
            if (candidate && !!this.serverID) {
                this.sendMessageToServer({
                    name: this.serverID,
                    type: "candidate",
                    candidate
                });
            }
        };
        this.peerConnection_local.ondatachannel = event => {
            console.log('Data channel is created!');
            this.getChannel = event.channel;
            this.getChannel.onopen = () => {
                console.log("GET Data channel is open and ready to be used.");
            };
            this.getChannel.onmessage = this.handleDataChannelMessageReceived;
        };
        this.peerConnection_local.onconnectionstatechange = (ev) => {
            switch (this.peerConnection_local.connectionState) {
                case "new":
                case "checking":
                    console.warn("Connecting…");
                    break;
                case "connected":
                    console.warn("Online");
                    break;
                case "disconnected":
                    console.warn("Disconnecting…");
                    break;
                case "closed":
                    console.warn("Offline");
                    break;
                case "failed":
                    console.warn("Error");
                    break;
                default:
                    console.warn("Unknown");
                    break;
            }
        }
        this.handleConnection();
    }
    handleConnection = () => {
        console.log('Trying to connect to ', this.clientID)
        this.sendChannel = this.peerConnection_local.createDataChannel(this.serverID, {ordered: false,
            maxRetransmits: 0});
        this.sendChannel.onerror = error => {
            console.log('Create SEND dta channel fail ', error)
        };
        this.sendChannel.onmessage = this.handleDataChannelMessageReceived;
        this.sendChannel.onopen = () => {
            console.log('Local channel open!');
            this.sendChannelReady = true;
            if (!this.streamHasInited)
                this.startFFStream();
        };
        this.sendChannel.onclose = () => {
            console.log('Local channel closed!');
        };

        this.peerConnection_local.createOffer()
            .then(offer => this.peerConnection_local.setLocalDescription(offer))
            .then(() =>
                this.sendMessageToServer({ type: "offer", offer: this.peerConnection_local.localDescription, name: this.clientID })
            )
            .catch(e => {
                console.log('Create offer fail ', e)
            });
    }
    onOffer = (data) => {
        // console.log('Someone send you an offer ', data);
        this.peerConnection_local
            .setRemoteDescription(new RTCSessionDescription(data.offer))
            .then(() => this.peerConnection_local.createAnswer())
            .then(answer => {
                console.log('Generated Answer ', answer)
                this.peerConnection_local.setLocalDescription(answer)
                    .then(() => {
                        console.log('Set local description from answer OK, this is the local Description ', this.peerConnection_local.localDescription)
                        sendMessageToServer({ type: "answer", answer: this.peerConnection_local.localDescription, name: data.name })
                    }
                    )
                    .catch(e => {
                        console.log('Fail to set local description from answer ', e)
                    });
            }
            )
    }
    onAnswer = ({ answer }) => {
        // console.log('Someone send you an answer ', answer);
        this.peerConnection_local.setRemoteDescription(new RTCSessionDescription(answer)).then(res => {
            console.log('Set Remote Description OK')
        }).catch(err => {
            console.log('Set Remote Description Fail ', err)
        });
    }
    onCandidate = ({ candidate }) => {
        // console.log(candidate)
        this.peerConnection_local.addIceCandidate(new RTCIceCandidate(candidate)).then(res => {
            console.log('Add ICE OK')
            // It's ok now to start streaming
            setTimeout(() => {
                if (!this.sendChannelReady)
                    this.handleConnection();
            }, 1000);
        }).catch(err => {
            console.log('Set ICE Fail ', err)
        });
    }
    startFFStream = () => {
        console.log('start Streaming');
        this.streamHasInited = true;
        let isExist = false;
        if (global.ffmpegStreamer.length > 0) {
            for (let i = 0; i < global.ffmpegStreamer.length; ++i) {
                let currentStreamInfo = global.ffmpegStreamer[i].getStreamInfo();
                if (currentStreamInfo.url == this.streamURL) {
                    isExist = true;
                    this.myFFStream = global.ffmpegStreamer[i];
                    break;
                }
            }
            if (!isExist) {
                let newStream =  new ffmpegStream(this.streamURL);
                this.myFFStream = newStream;
                global.ffmpegStreamer.push(newStream);
            }
        }
        else {
            let newStream =  new ffmpegStream(this.streamURL);
            this.myFFStream = newStream;
            global.ffmpegStreamer.push(newStream);
        }

        let self = this;
        this.myFFStream.startStream();
        this.myFFStream.eventEmitter.on('newFrame', function (frame) {
            if(self.cachedLast5Frames !=null)
            {
                if(!self.cachedLast5Frames.includes(frame))
                {
                    if(self.cachedLast5Frames.length==5)
                    self.cachedLast5Frames.shift();
                    
                    self.cachedLast5Frames.push(frame);
                    
                    self.streamData(frame);
                }               
                else
                console.log('Trùng frame')
            }
            // self.streamData(frame);
        });
    }
    streamData = (frame) => {
        console.log('Sending new frame to client')
        //Sending data in 16KB chunk
        try {
            //First signal the frame start
            if (this.sendChannel.bufferedAmount > 0)
                return;
            this.sendChannel.send(JSON.stringify({
                type: 'frame_start'
            }));

            //Then, chunk the frame and send parts till all chunks have been out
            let chunks = []
            for (var i = 0, charsLength = frame.length; i < charsLength; i += 4100) {
                chunks.push(frame.substring(i, i + 4100));
            }
            chunks.forEach(chunk => {
                if (this.sendChannel.bufferedAmount > 0)
                    return;
                this.sendChannel.send(JSON.stringify({
                    type: 'frame_part',
                    chunk: chunk
                }));
            });

            //Last, signal the frame end
            if (this.sendChannel.bufferedAmount > 0)
                return;
            this.sendChannel.send(JSON.stringify({
                type: 'frame_end'
            }));

        } catch (error) {
            console.log(error)
        }
    }
    handleDataChannelMessageReceived = ({ data }) => {
        const message = JSON.parse(data);
        console.log('New Message Recieved ', message);
    }
    chunkBufferTo16KBsArray(buf, maxBytes) {
        buf
        let result = [];
        while (buf.length) {
            let i = buf.lastIndexOf(32, maxBytes + 1);
            // If no space found, try forward search
            if (i < 0) i = buf.indexOf(32, maxBytes);
            // If there's no space at all, take the whole string
            if (i < 0) i = buf.length;
            // This is a safe cut-off point; never half-way a multi-byte
            result.push(buf.slice(0, i).toString());
            buf = buf.slice(i + 1); // Skip space (if any)
        }
        return result;

    }
}