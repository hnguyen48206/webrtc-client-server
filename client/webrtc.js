var localVideo;
var localStream;
var remoteVideo;
var peerConnection_local;
var peerConnection_remote;

var myName;
var serverConnection;

var sendChannel
var getChannel
var peerConnection_localConfig = {
    'iceServers': [
        {
            urls: 'turn:127.0.0.1:9001',
            username: "hnguyen48206",
            credential: "123456"
        }
    ]
};
var currentListOfUsers = []

var sendButton = null;
var messageInputBox = null;
var receiveBox = null;
var isSocketOpened = false;
var videoOutput
function pageReady() {

    sendButton = document.getElementById('sendButton');
    messageInputBox = document.getElementById('message');
    receiveBox = document.getElementById('receivebox');
    videoOutput = document.getElementById('testStream');
    // sendButton.addEventListener('click', sendMessage, false);

    // uuid = createUUID();

    localTxt = document.getElementById('localTxt');
    remoteTxt = document.getElementById('remoteTxt');

    serverConnection = new WebSocket('ws://localhost:9000');
    serverConnection.onmessage = gotMessageFromServer;
    serverConnection.onclose = () => {
        serverConnection.close();
    };
}

function sendMessageToServer(data) {
    serverConnection.send(JSON.stringify(data));
}

function gotMessageFromServer(message) {
    console.log('Message from server ', message)
    const data = JSON.parse(message.data);
    if (data) {
        switch (data.type) {
            case "connect":
                isSocketOpened = true;
                console.log('Socket Connected')
                break;
            case "login":
                onLogin(data);
                break;
            case "updateUsers":
                updateUsersList(data);
                break;
            case "removeUser":
                removeUser(data);
                break;
            case "offer":
                onOffer(data);
                break;
            case "answer":
                onAnswer(data);
                break;
            case "candidate":
                onCandidate(data);
                break;
            default:
                break;
        }
    }

}


function login() {
    var randomName = 'user_' + (new Date().toLocaleTimeString());
    document.getElementById('username').innerHTML = randomName;
    sendMessageToServer({
        type: "login",
        name: randomName
    })
    myName = randomName;
}

function onLogin(data) {
    console.log(data)
    if (data.success) {
        console.log('Loggin ok')
        console.log('Current list of users ', data.users)
        currentListOfUsers = data.users;
        document.getElementById('currentUserList').innerHTML = JSON.stringify(currentListOfUsers)
        //Start WebRTC
        initWebRTCLocal();
    }
    else {
        console.log('Login Fail ', data.message)
    }
}

function updateUsersList(data) {
    console.log(data)
    console.log('New user Logged in ', data.user)
    currentListOfUsers.push(data.user)
    document.getElementById('currentUserList').innerHTML = JSON.stringify(currentListOfUsers)
}

function initWebRTCLocal() {
    peerConnection_local = new RTCPeerConnection(peerConnection_localConfig);
    //when the browser finds an ice candidate we send it to another peer
    peerConnection_local.onicecandidate = ({ candidate }) => {
        let connectedTo = myName
        if (candidate && !!connectedTo) {
            sendMessageToServer({
                name: connectedTo,
                type: "candidate",
                candidate
            });
        }
    };
    peerConnection_local.ondatachannel = event => {
        console.log('Data channel is created!');
        getChannel = event.channel;
        getChannel.onopen = () => {
            console.log("GET Data channel is open and ready to be used.");
        };
        getChannel.onmessage = handleDataChannelMessageReceived;
    };
}

function handleConnection() {
    let name = currentListOfUsers[currentListOfUsers.length - 1].userName
    console.log('Trying to connect to ', name)
    sendChannel = peerConnection_local.createDataChannel("messenger");
    sendChannel.onerror = error => {
        console.log('Create SEND dta channel fail ', error)
    };
    sendChannel.onmessage = handleDataChannelMessageReceived;
    sendChannel.onopen = () => {
        console.log('Local channel open!');
    };
    sendChannel.onclose = () => {
        console.log('Local channel closed!');
    };
    peerConnection_local.createOffer()
        .then(offer => peerConnection_local.setLocalDescription(offer))
        .then(() =>
            sendMessageToServer({ type: "offer", offer: peerConnection_local.localDescription, name: name })
        )
        .catch(e => {
            console.log('Create offer fail ', e)
        });
}

function onOffer(data) {
    console.log('Someone send you an offer ', data);
    peerConnection_local
        .setRemoteDescription(new RTCSessionDescription(data.offer))
        .then(() => peerConnection_local.createAnswer())
        .then(answer => {
            console.log('Generated Answer ', answer)
            peerConnection_local.setLocalDescription(answer)
                .then(() => {
                    console.log('Set local description from answer OK, this is the local Description ', peerConnection_local.localDescription)
                    sendMessageToServer({ type: "answer", answer: peerConnection_local.localDescription, name: data.name })
                }
                )
                .catch(e => {
                    console.log('Fail to set local description from answer ', e)
                });
        }
        )

}

const onAnswer = ({ answer }) => {
    console.log('Someone send you an answer ', answer);
    peerConnection_local.setRemoteDescription(new RTCSessionDescription(answer)).then(res => {
        console.log('Set Remote Description OK')
    }).catch(err => {
        console.log('Set Remote Description Fail ', err)
    });
};

const onCandidate = ({ candidate }) => {
    console.log(candidate)
    peerConnection_local.addIceCandidate(new RTCIceCandidate(candidate)).then(res => {
        console.log('Add ICE OK')
    }).catch(err => {
        console.log('Set ICE Fail ', err)
    });;
};

function sendMessage() {
    var message = messageInputBox.value;
    console.log(sendChannel)
    sendChannel.send(JSON.stringify(message));
    messageInputBox.value = "";
    messageInputBox.focus();
}

//close alerts
const closeAlert = () => {
    setAlert(null);
};
//remove a user from users
const removeUser = ({ user }) => {
    currentListOfUsers.filter(u => u.userName !== user.userName);
}
const handleDataChannelMessageReceived = ({ data }) => {
    const message = JSON.parse(data);
    if(message.type == 'frame')
    {
        console.log('New Frame Recieved ', message);
        setTimeout(() => {
            videoOutput.src='data:image/jpeg;base64,' + message.frame
        }, 1000);
    }
    else
    console.log('New Message Recieved ', message);
};

function startServerStream()
{
    console.log(myName)
    sendMessageToServer({
        type: "startServerStream",
        clientID: myName,
        streamURL: 'rtsp://10.159.12.183:8554/getFile.265'
        // streamURL:'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4'
        // streamURL:'rtsp://admin:Vnpt@123@192.168.0.65:554/ch1/main/av_stream'
    })
}