var RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection,
    RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription,
    RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate,
    getUserMedia = null;

if (navigator.webkitGetUserMedia !== undefined) {
    getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
} else if (navigator.mozGetUserMedia !== undefined) {
    getUserMedia = navigator.mozGetUserMedia.bind(navigator);
}

var DEFAULT_STUN_SERVER = {'url': 'stun:stun.l.google.com:19302'},

_socket = io.connect('http://localhost:3000/'),

_roomId = '',

_pcs = [],

_dcs = [],

/**
 * If a download has started, _downloadStatus will be the number of chunks that
 * remain to be recieved.
 */
_downloadStatus = 0,

/**
 * The actual data in the downloaded file. It is appended each time a chunk is
 * recieved.
 */
_download = '',

_downloadName = '';

/**
 * Broadcasts a message to the room.
 *
 * @param message {String} The message to be broadcasted.
 * @param dcs {Array} array of DataChannels to send the message to.
 */
function send(message) {
    var i;
    for (i = 0;i < _dcs.length;i++) {
        if (_dcs[i] !== undefined && _dcs[i].readyState == "open") {
            _dcs[i].send(message);
        }
    }
}

var temp_messages = [];

/**
 * Broadcasts a file download to the room given a file input element
 *
 * @param id {String} The id of the file input element.
 */
function sendLarge(message) {
    var connected = true;

    for (var i = 0;i < _dcs.length;i++) {
        if (_dcs[i] !== undefined && _dcs[i].readyState != "open")
            connected = false;
    }

    if (connected) {
        var size = message.length,
            chunkSize = 1000,
            numChunks = Math.ceil(size / chunkSize),
            j = 0,
            i;

        send('start' + numChunks);
        sendChunk(message, chunkSize, 0, numChunks);
    } else {
        temp_messages.push(message);
    }
}

function sendChunk(message, chunkSize, chunk, maxChunks) {
    send(message.substring(chunk*chunkSize,  chunk*chunkSize + chunkSize));
    if (chunk < maxChunks) {
        setTimeout(function () {
            sendChunk(message, chunkSize, chunk+1, maxChunks);
        }, 400);
    }
}

function _startDataChannel (id) {
    _dcs[id] = _pcs[id].createDataChannel('data', {'reliable': true});

    _dcs[id].onmessage = function(message) {
        console.log('RAW' + message.data);
        console.log('STATUS: ' + _downloadStatus);
        if (_downloadStatus > 0) {
            _download += message.data;

            _downloadStatus--;
            console.log('STAT: ' + _downloadStatus);

            if (_downloadStatus == 0) {
                console.log(_download);
                
                _download = '';
            }
        } else {
            console.log('WO' + message.data.substring(0, 5));
            if (message.data.substring(0, 5) == 'start') {
                var splitComma = message.data.indexOf(',');
                _downloadStatus = parseInt(message.data.substring(5), 10);
                console.log(message.data.substring(5));
            }
        }
    };
}

/**
 * Creates a connection between two peer connections, starts a datachannel, and adds the localStream.
 *
 * @param id {String} the id of the local peer connection
 */
function _createConn (id) {
    var configuration = {'iceServers': [DEFAULT_STUN_SERVER]},
        connection = null;

    _pcs[id] = new RTCPeerConnection(configuration, connection);
    _startDataChannel(id);
}

var client_id;

function makeConnection (roomId, callback) {
    //the server calls to signify that it knows what room client is in.
    _socket.on('joined', function (data) {
        client_id = data.client_id;
        id = data.id;

        //is where the connection 'chaining' starts.
        if (client_id !== 0) {
            _createConn(0);
            _updateDescription(_pcs[0], client_id, 0);
        }

        callback(id);
    });

    _socket.on('add_desc', function (data) {
        var client_id = data.from_client_id,
            id = data.id,
            owner = false;

        console.log(data.client_id + " <------ " + client_id);

        if (_pcs[client_id] === undefined) {
            _createConn(client_id);
            owner = true;
        }

        //called when we recieve an ice candidate from the other client
        var exp = 1;
        _pcs[client_id].onicecandidate = function (event) {
            if (event.candidate) {
                _socket.emit('cand', {
                    'client_id': client_id,
                    'from_client_id': data.client_id,
                    'cand': event.candidate,
                    'id': id
                });
                console.log(exp);
                exp++;
            }
        };

        _pcs[client_id].setRemoteDescription(new RTCSessionDescription(data.desc));

        if (owner) {
            _pcs[client_id].createAnswer(function (desc) {
                _pcs[client_id].setLocalDescription(desc);

                console.log(data.client_id + " ------> " + data.from_client_id);
                _socket.emit('desc', {
                    'client_id': data.from_client_id,
                    'from_client_id': data.client_id,
                    'desc': desc,
                    'id': id
                });
            });
        }
    });

    _socket.on('add_cand', function (data) {
        if (_pcs[data.client_id] === undefined) {
            if (cands[data.client_id] === undefined) {
                cands[data.client_id] = [];
            }
            cands[data.client_id].push(data.cand);
        } else {
            _pcs[data.client_id].addIceCandidate(new RTCIceCandidate(data.cand));
        }

        if (data.client_id < client_id) {
            setTimeout(function() {
                checkConn(data.client_id);
            }, 2000);
        }
    });

    console.log(roomId);

    //tell the server what room to join.
    _socket.emit('join', {
        'id': roomId
    });
}

function _updateDescription(pc, client_id2, _client_id) {
    var thisWebRTC = this;
    pc.createOffer(function (desc) {
        pc.setLocalDescription(desc);
        console.log(client_id2 + " ------> " + _client_id);
        thisWebRTC._socket.emit('desc', {
            'client_id': _client_id,
            'from_client_id': client_id2,
            'desc': desc,
            'id': id
        });
    }, null);
}

function checkConn(dc_id) {
    if (_dcs[dc_id].readyState != "open") {
        _updateDescription(_pcs[dc_id], client_id, dc_id);
    }
}
var theId = window.location.pathname.match(/\/(\d+)/);
if (theId)
    theId = theId[1]
else
    theId = '';

console.log("ID" + theId);
makeConnection(theId, function (id) {
    console.log('id: ' + id); 
});
