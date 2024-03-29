const HTTP = "http://localhost:8080";
const WS = "ws://localhost:8080";
const ServerMessages = {
    WEBRTC_ROOM_USERS: "WEBRTC_ROOM_USERS",
    WEBRTC_ROOM_USER_ADDED: "WEBRTC_ROOM_USER_ADDED",
    WEBRTC_ROOM_USER_LEFT: "WEBRTC_ROOM_USER_LEFT",
    WEBRTC_USER_ANSWER: "WEBRTC_USER_ANSWER",
    WEBRTC_MIXER_ANSWER: "WEBRTC_MIXER_ANSWER",
    WEBRTC_USER_ICE_CANDIDATE: "WEBRTC_USER_ICE_CANDIDATE",
    WEBRTC_MIXER_ICE_CANDIDATE: "WEBRTC_MIXER_ICE_CANDIDATE"
};
const Destinations = {
    USER_JOIN: "user/join",
    USER_LEAVE: "user/leave",
    USER_OFFER: "user/offer",
    USER_ICE_CANDIDATE: "user/ice-candidate",
    MIXER_OFFER: "mixer/offer",
    MIXER_ICE_CANDIDATE: "mixer/ice-candidate"
};
const mediaConstraints = {
    audio: true,
    video: false
};
document.addEventListener("DOMContentLoaded", function() {
    let user;
    let stompClient;
    let localAudio = document.getElementById("local-audio");
    let remoteAudio = document.getElementById("remote-audio");
    let localPeer;
    let remotePeer;
    document.getElementById("login").onclick = function () {
        fetch(HTTP + "/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                name: document.getElementById("username").value
            })
        }).then(function(response) {
            return response.json();
        }).then(function(data) {
            user = data;
            stompClient = Stomp.over(new WebSocket(WS + "/stomp"));
            stompClient.connect({"user-id": user.id}, function () {
                stompClient.subscribe('/topic/' + user.id, function (message) {
                    handleMessage(JSON.parse(message.body));
                });
            });
        })
    };
    document.getElementById("join").onclick = function () {
        sendMessage({userId: user.id}, Destinations.USER_JOIN);
    };
    document.getElementById("leave").onclick = function () {
        localPeer.dispose();
        remotePeer.dispose();
        document.getElementById("local").hidden = true;
        document.getElementById("remote").hidden = true;
        document.getElementById("user" + user.id).remove();
        sendMessage({}, Destinations.USER_LEAVE);
    };
    function handleMessage(message) {
        switch (message.id) {
            case ServerMessages.WEBRTC_ROOM_USERS:
                onExistingParticipants(message.data);
                break;
            case ServerMessages.WEBRTC_ROOM_USER_ADDED:
                onNewUserAdded(message.data);
                break;
            case ServerMessages.WEBRTC_ROOM_USER_LEFT:
                onUserLeft(message.data);
                break;
            case ServerMessages.WEBRTC_USER_ANSWER:
                onAnswer(message.data, localPeer);
                break;
            case ServerMessages.WEBRTC_MIXER_ANSWER:
                onAnswer(message.data, remotePeer);
                break;
            case ServerMessages.WEBRTC_USER_ICE_CANDIDATE:
                onIceCandidate(message.data, localPeer)
                break;
            case ServerMessages.WEBRTC_MIXER_ICE_CANDIDATE:
                onIceCandidate(message.data, remotePeer)
                break;
            default:
                console.error('Unrecognized message', message);
        }
    }
    function onNewUserAdded(data) {
        appendUser(data.user);
    }
    function onAnswer(data, peer) {
        peer.processAnswer(data.sdp, function (error) {
            if (error) return console.error(error);
        });
    }
    function onExistingParticipants(data) {
        for (let index in data.users) {
            appendUser(data.users[index]);
        }
        localPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendonly({
                localVideo: localAudio,
                mediaConstraints: mediaConstraints,
                onicecandidate: function (candidate) {
                    sendIceCandidate(candidate, Destinations.USER_ICE_CANDIDATE);
                }
            }, function (error) {
                if (error) return console.error(error);
                document.getElementById("local-username").innerText = user.name;
                document.getElementById("local").hidden = false;
                 this.generateOffer(function (error, offerSdp) {
                     if (error) return console.error(error)
                     sendMessage({sdp: offerSdp}, Destinations.USER_OFFER);
                 });
            });
        remotePeer = new kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly({
                remoteVideo: remoteAudio,
                mediaConstraints: mediaConstraints,
                onicecandidate: function (candidate) {
                    sendIceCandidate(candidate, Destinations.MIXER_ICE_CANDIDATE);
                }
            },
            function (error) {
                if (error) return console.error(error);
                document.getElementById("remote").hidden = false;
                this.generateOffer(function (error, offerSdp) {
                    if (error) return console.error(error)
                    sendMessage({sdp: offerSdp}, Destinations.MIXER_OFFER);
                });
            });
    }
    function onUserLeft(data) {
        document.getElementById("user" + data.user.id).remove();
    }
    function onIceCandidate(data, peer) {
        peer.addIceCandidate({
             sdpMLineIndex: data.sdpMLineIndex,
             sdpMid: data.sdpMLineIndex,
             candidate: data.sdp,
        }, function (error) {
            if (error) console.error(error);
        });
    }
    function sendIceCandidate(candidate, destination) {
        sendMessage({
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid,
            sdp: candidate.candidate
        }, destination);
    }
    function appendUser(user) {
        let userElement = document.createElement("li");
        userElement.id = "user" + user.id;
        userElement.textContent = user.name;
        document.getElementById("users").appendChild(userElement);
    }
    function sendMessage(message, destination) {
        stompClient.send("/webrtc/" + destination, {}, JSON.stringify(message));
    }
});
