
//
var server = null;
if (window.location.protocol === 'http:')
    server = "http://" + window.location.hostname + ":8088/janus";
else
    server = "https://" + window.location.hostname + ":8089/janus";

// Backend server
var backHost = "http://" + window.location.hostname + ":3000/stream";

var janus = null;
var sfutest = null;
var opaqueId = "videoroomtest-" + Janus.randomString(12);

var myroom = null;	// Demo room
var myusername = null;
var myid = null;
var mystream = null;
// We use this other ID just to map our subscriptions to us
var mypvtid = null;
var pin = null;


var feeds = [];
var bitrateTimer = [];

var doSimulcast = false;

$(document).ready(function () {
    // Initialize the library (all console debuggers enabled)
    Janus.init({
        debug: "all", callback: function () {
            // Use a button to start the demo
            $("#start").one('click', function () {
                console.log("Hi I am here !!!")
                // requestStart()
                if (!Janus.isWebrtcSupported()) {
                    bootbox.alert("No WebRTC support... ");
                    return;
                }
                // Create session
                janus = new Janus(
                    {
                        server: server,
                        success: function () {
                            // Attach to video room test plugin
                            janus.attach(
                                {
                                    plugin: "janus.plugin.videoroom",
                                    opaqueId: opaqueId,
                                    success: function (pluginHandle) {
                                        sfutest = pluginHandle;
                                        Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                                        Janus.log("  -- This is a publisher/manager");
                                        requestStart().then(registerUsername);
                                        
                                    },
                                    error: function (error) {
                                        Janus.error("  -- Error attaching plugin...", error);
                                        bootbox.alert("Error attaching plugin... " + error);
                                    },
                                    mediaState: function (medium, on) {
                                        Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                                    },
                                    webrtcState: function (on) {
                                    },
                                    onmessage: function (msg, jsep) {
                                        Janus.debug(" ::: Got a message (publisher) :::");
                                        Janus.debug(msg);
                                        var event = msg["videoroom"];
                                        Janus.debug("Event: " + event);
                                        if (event != undefined && event != null) {
                                            if (event === "joined") {
                                                // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                                myid = msg["id"];
                                                mypvtid = msg["private_id"];
                                                Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                                publishOwnFeed(true);
                                              
                                            } else if (event === "destroyed") {
                                                // The room has been destroyed
                                                Janus.warn("The room has been destroyed!");
                                                bootbox.alert("The room has been destroyed", function () {
                                                    window.location.reload();
                                                });
                                            } else if (event === "event") {
                                                // Any new feed to attach to?
                                                if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                                    var list = msg["publishers"];
                                                    Janus.debug("Got a list of available publishers/feeds:");
                                                    Janus.debug(list);
                                                    for (var f in list) {
                                                        var id = list[f]["id"];
                                                        var display = list[f]["display"];
                                                        var audio = list[f]["audio_codec"];
                                                        var video = list[f]["video_codec"];
                                                        Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                        newRemoteFeed(id, display, audio, video);
                                                    }
                                                } else if (msg["leaving"] !== undefined && msg["leaving"] !== null) {
                                                    // One of the publishers has gone away?
                                                    var leaving = msg["leaving"];
                                                    Janus.log("Publisher left: " + leaving);
                                                    var remoteFeed = null;
                                                    for (var i = 1; i < 6; i++) {
                                                        if (feeds[i] != null && feeds[i] != undefined && feeds[i].rfid == leaving) {
                                                            remoteFeed = feeds[i];
                                                            break;
                                                        }
                                                    }
                                                    if (remoteFeed != null) {
                                                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                        $('#remote' + remoteFeed.rfindex).empty().hide();
                                                        $('#videoremote' + remoteFeed.rfindex).empty();
                                                        feeds[remoteFeed.rfindex] = null;
                                                        remoteFeed.detach();
                                                    }
                                                } else if (msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                                                    // One of the publishers has unpublished?
                                                    var unpublished = msg["unpublished"];
                                                    Janus.log("Publisher left: " + unpublished);
                                                    if (unpublished === 'ok') {
                                                        // That's us
                                                        sfutest.hangup();
                                                        return;
                                                    }
                                                    var remoteFeed = null;
                                                    for (var i = 1; i < 6; i++) {
                                                        if (feeds[i] != null && feeds[i] != undefined && feeds[i].rfid == unpublished) {
                                                            remoteFeed = feeds[i];
                                                            break;
                                                        }
                                                    }
                                                    if (remoteFeed != null) {
                                                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                        $('#remote' + remoteFeed.rfindex).empty().hide();
                                                        $('#videoremote' + remoteFeed.rfindex).empty();
                                                        feeds[remoteFeed.rfindex] = null;
                                                        remoteFeed.detach();
                                                    }
                                                } else if (msg["error"] !== undefined && msg["error"] !== null) {
                                                    if (msg["error_code"] === 426) {
                                                        // This is a "no such room" error: give a more meaningful description
                                                        bootbox.alert(
                                                            "<p>Apparently room <code>" + myroom + "</code> (the one this demo uses as a test room) " +
                                                            "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.cfg</code> " +
                                                            "configuration file? If not, make sure you copy the details of room <code>" + myroom + "</code> " +
                                                            "from that sample in your current configuration file, then restart Janus and try again."
                                                        );
                                                    } else {
                                                        bootbox.alert(msg["error"]);
                                                    }
                                                }
                                            }
                                        }
                                        if (jsep !== undefined && jsep !== null) {
                                            Janus.debug("Handling SDP as well...");
                                            Janus.debug(jsep);
                                            sfutest.handleRemoteJsep({ jsep: jsep });
                                            // Check if any of the media we wanted to publish has
                                            // been rejected (e.g., wrong or unsupported codec)
                                            var audio = msg["audio_codec"];
                                            if (mystream && mystream.getAudioTracks() && mystream.getAudioTracks().length > 0 && !audio) {
                                                // Audio has been rejected
                                                toastr.warning("Our audio stream has been rejected, viewers won't hear us");
                                            }
                                            var video = msg["video_codec"];
                                            if (mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
                                                // Video has been rejected
                                                toastr.warning("Our video stream has been rejected, viewers won't see us");
                                                // Hide the webcam video
                                                $('#myvideo').hide();
                                                $('#videolocal').append(
                                                    '<div class="no-video-container">' +
                                                    '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
                                                    '<span class="no-video-text" style="font-size: 16px;">Video rejected, no webcam</span>' +
                                                    '</div>');
                                            }
                                        }
                                    },
                                    onlocalstream: function (stream) {
                                        Janus.debug(" ::: Got a local stream :::");
                                        mystream = stream;
                                        $('#videos').removeClass('hide').show();
                                        
                                        $('#publisher').removeClass('hide').html(myusername).show();
                                        Janus.attachMediaStream($('#myvideo').get(0), stream);
                                        $("#myvideo").get(0).muted = "muted";
                                        if (sfutest.webrtcStuff.pc.iceConnectionState !== "completed" &&
                                            sfutest.webrtcStuff.pc.iceConnectionState !== "connected") {
                                            $("#videolocal").parent().parent().block({
                                                message: '<b>Publishing...</b>',
                                                css: {
                                                    border: 'none',
                                                    backgroundColor: 'transparent',
                                                    color: 'white'
                                                }
                                            });
                                        }
                                        var videoTracks = stream.getVideoTracks();
                                        if (videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
                                            // No webcam
                                            $('#myvideo').hide();
                                            if ($('#videolocal .no-video-container').length === 0) {
                                                $('#videolocal').append(
                                                    '<div class="no-video-container">' +
                                                    '<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
                                                    '<span class="no-video-text">No webcam available</span>' +
                                                    '</div>');
                                            }
                                        } else {
                                            $('#videolocal .no-video-container').remove();
                                            $('#myvideo').removeClass('hide').show();
                                        }
                                    },
                                    onremotestream: function (stream) {
                                        // The publisher stream is sendonly, we don't expect anything here
                                    },
                                    oncleanup: function () {
                                        mystream = null;
                                    }
                                });
                        },
                        error: function (error) {
                            Janus.error(error);
                            bootbox.alert(error, function () {
                                window.location.reload();
                            });
                        },
                        destroyed: function () {
                            window.location.reload();
                        }
                    });
            });
        }
    });
});

async function registerUsername() {
    var username = 'yanhao';
   
    var register = { "request": "join", "room": myroom, "ptype": "publisher", "display": username, "pin": pin, id: myid};
    myusername = username;
    sfutest.send({ "message": register });
    var bitrate = 2000 * 1024;
    sfutest.send({ "message": { "request": "configure", "bitrate": bitrate } });
}

function publishOwnFeed(useAudio) {
    // Publish our stream
    $('#publish').attr('disabled', true).unbind('click');
    sfutest.createOffer(
        {
            // Add data:true here if you want to publish datachannels as well
            media: { audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true },	// Publishers are sendonly
            // If you want to test simulcasting (Chrome and Firefox only), then
            // pass a ?simulcast=true when opening this demo page: it will turn
            // the following 'simulcast' property to pass to janus.js to true
            simulcast: doSimulcast,
            success: function (jsep) {
                Janus.debug("Got publisher SDP!");
                Janus.debug(jsep);
                var publish = { "request": "configure", "audio": useAudio, "video": true };
                // You can force a specific codec to use when publishing by using the
                // audiocodec and videocodec properties, for instance:
                // 		publish["audiocodec"] = "opus"
                // to force Opus as the audio codec to use, or:
                // 		publish["videocodec"] = "vp9"
                // to force VP9 as the videocodec to use. In both case, though, forcing
                // a codec will only work if: (1) the codec is actually in the SDP (and
                // so the browser supports it), and (2) the codec is in the list of
                // allowed codecs in a room. With respect to the point (2) above,
                // refer to the text in janus.plugin.videoroom.cfg for more details
                sfutest.send({ "message": publish, "jsep": jsep });
            },
            error: function (error) {
                Janus.error("WebRTC error:", error);
                if (useAudio) {
                    publishOwnFeed(false);
                } else {
                    bootbox.alert("WebRTC error... " + JSON.stringify(error));
                    $('#publish').removeAttr('disabled').click(function () { publishOwnFeed(true); });
                }
            }
        });
}

function unpublishOwnFeed() {
    // Unpublish our stream
    $('#unpublish').attr('disabled', true).unbind('click');
    var unpublish = { "request": "unpublish" };
    sfutest.send({ "message": unpublish });
}

async function requestStart(){
    await fetch(backHost, {
        cache: "no-cache",
        credentials: "omit",
        headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json"
        },
        method: "POST",
        body: JSON.stringify({
            login: document.getElementById("usrname").value,
            passwd: document.getElementById("password").value,
            roomid: parseInt(document.getElementById("roomid").value),
            request: 'publish'
        })
    }).then(response => {
        return response.json()
    }).then(data => {
        console.log(data)
        if (data.status === "success"){
            myroom = data.key.room
            pin = data.key.pin
            myid = data.key.id
        }
    })
}

async function requestStop(){
    await fetch(backHost, {
        cache: "no-cache",
        credentials: "omit",
        headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json"
        },
        method: "POST",
        body: JSON.stringify({
            
        })
    }).then(response => {
        return response.json()
    }).then(data => {
        console.log(data)
        if (data.status === "success"){
           
        }
    })
}

