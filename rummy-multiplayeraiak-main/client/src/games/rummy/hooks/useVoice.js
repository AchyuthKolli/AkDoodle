import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../../../socket";

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export const useVoice = (tableId, userId) => {
    const [inCall, setInCall] = useState(false);
    const [participants, setParticipants] = useState([]); // { userId, stream, isMuted }
    const [isMuted, setIsMuted] = useState(false);

    const localStreamRef = useRef(null);
    const peersRef = useRef({}); // { userId: RTCPeerConnection }

    // Cleanup function
    const leaveCall = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        Object.values(peersRef.current).forEach(peer => peer.close());
        peersRef.current = {};

        setInCall(false);
        setParticipants([]);
        socket.emit("voice.leave", { table_id: tableId, user_id: userId });
    }, [tableId, userId]);

    // Track socket-connected users (presence) vs stream-connected users (audio)
    const [connectedUsers, setConnectedUsers] = useState([]);

    // Handle incoming signals
    useEffect(() => {
        if (!inCall) return;

        // Emit join AFTER listeners are set up (next tick effectively, but safe here)
        socket.emit("voice.join", { table_id: tableId, user_id: userId });

        const handleSignal = async ({ sender_id, type, data }) => {
            let peer = peersRef.current[sender_id];

            if (!peer && type === "offer") {
                peer = createPeer(sender_id, false);
            }

            if (peer) {
                if (type === "offer") {
                    await peer.setRemoteDescription(new RTCSessionDescription(data));
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    socket.emit("voice.signal", {
                        table_id: tableId,
                        target_id: sender_id,
                        type: "answer",
                        data: answer
                    });
                } else if (type === "answer") {
                    await peer.setRemoteDescription(new RTCSessionDescription(data));
                } else if (type === "ice-candidate") {
                    await peer.addIceCandidate(new RTCIceCandidate(data));
                }
            }
        };

        const handleUserJoined = async ({ user_id }) => {
            if (user_id === userId) return; // Ignore self
            console.log("User joined voice:", user_id);
            setConnectedUsers(prev => [...new Set([...prev, user_id])]);
            createPeer(user_id, true); // Initiator
        };

        const handleUserLeft = ({ user_id }) => {
            console.log("User left voice:", user_id);
            if (peersRef.current[user_id]) {
                peersRef.current[user_id].close();
                delete peersRef.current[user_id];
                setParticipants(prev => prev.filter(p => p.userId !== user_id));
            }
            setConnectedUsers(prev => prev.filter(id => id !== user_id));
        };

        // Listen for list of existing users when we join
        const handleExistingUsers = ({ users }) => {
            console.log("Existing voice users:", users);
            // users is array of userIds
            const others = users.filter(id => id !== userId);
            setConnectedUsers(others);
            others.forEach(uid => createPeer(uid, true));
        };

        socket.on("voice.signal", handleSignal);
        socket.on("voice.joined", handleUserJoined);
        socket.on("voice.left", handleUserLeft);
        socket.on("voice.existing_users", handleExistingUsers); // Server needs to emit this on join!

        return () => {
            socket.off("voice.signal");
            socket.off("voice.joined");
            socket.off("voice.left");
            socket.off("voice.existing_users");
        };
    }, [inCall, tableId, userId]);

    const createPeer = (targetId, initiator) => {
        if (peersRef.current[targetId]) return peersRef.current[targetId];

        const peer = new RTCPeerConnection(ICE_SERVERS);
        peersRef.current[targetId] = peer;

        // Add local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));
        }

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("voice.signal", {
                    table_id: tableId,
                    target_id: targetId,
                    type: "ice-candidate",
                    data: event.candidate
                });
            }
        };

        peer.oniceconnectionstatechange = () => {
            console.log(`ICE state for ${targetId}: ${peer.iceConnectionState}`);
            if (peer.iceConnectionState === 'failed') {
                console.warn("ICE connection failed, restarting...");
                peer.restartIce();
            }
        };

        peer.ontrack = (event) => {
            const stream = event.streams[0];
            setParticipants(prev => {
                if (prev.find(p => p.userId === targetId)) return prev;
                return [...prev, { userId: targetId, stream }];
            });
        };

        if (initiator) {
            peer.createOffer().then(offer => {
                peer.setLocalDescription(offer);
                socket.emit("voice.signal", {
                    table_id: tableId,
                    target_id: targetId,
                    type: "offer",
                    data: offer
                });
            });
        }

        return peer;
    };

    const joinCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setInCall(true);
            // Socket join emitted in useEffect to ensure listeners are ready
        } catch (e) {
            console.error("Failed to get local stream", e);
            toast.error("Could not access microphone.");
        }
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            track.enabled = !track.enabled;
            setIsMuted(!track.enabled);
        }
    };

    return { joinCall, leaveCall, toggleMute, isMuted, inCall, participants, connectedUsers };
};
