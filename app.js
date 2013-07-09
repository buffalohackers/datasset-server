
/**
 * Module dependencies.
 */

var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , routes = require('./routes')
  , path = require('path')
  , mu2Express = require('mu2express');

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.engine('mustache', mu2Express.engine);
app.set('view engine', 'mustache');
app.use(express.favicon());
//app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.webrtc);
app.get('/:id', routes.webrtc);

var sessions = {};
var sockets = {};

io.sockets.on('connection', function (socket) {
	socket.on('desc', function(data) {
		if (data.client_id !== undefined) {
			console.log('sending' + data.client_id);
			sockets[data.id][data.client_id].emit('add_desc', data);
		}
		// //up to sockets.length-2 because sockets[sockets.length-1] is the current socket.
		// for (var i = 0;i < sockets[data.id].length-2;i++) {
		// 	sockets[data.id][i].emit('add_desc', data);

		// 	// for (var j = 0;j < sessions[data.id][i]['cand'].length;j++) {
		// 	// 	sockets[data.id][sockets[data.id].length-1].emit('add_cand', {'cand': sessions[data.id][i]['cand'][j], 'numConn': data.client_id});
		// 	// }
		// }
		
		sessions[data.id][data.client_id].desc = data.desc;
	});

	socket.on('cand', function(data) {
		//up to sockets.length-2 because sockets[sockets.length-1] is the current socket.
		//for (var i = 0;i < sockets[data.id].length-1;i++) {
			sockets[data.id][data.client_id].emit('add_cand', {'cand': data.cand, 'client_id': data.from_client_id});
		//}
		//sessions[data.id][data.client_id]['cand'].push(data.cand);
	});

	socket.on('join', function(data) {
		if (data.id !== '' && sockets[data.id] !== undefined) {
			client_id = sockets[data.id].length;
			id = data.id;

			// for (var i = 0;i < sessions[data.id].length;i++) {
			// 	socket.emit('add_desc', {'id': data.id, 'client_id': i, 'desc': sessions[data.id][i].desc});
			// }
		} else {
			var id;
			do {
				id = Math.floor(Math.random()*1000000);
			} while (id in sessions);

			client_id = 0;
		}

		if (sessions[id] === undefined) {
			sessions[id] = [];
			sockets[id] = [];
		}
		sessions[id].push({'client_id': client_id, 'desc': '', 'cand': []});
		sockets[id].push(socket);
		socket.emit('joined', {'client_id': client_id, 'id': id});

		// if (data.id !== '' && sockets[data.id] !== undefined) {
		// 	for (var i = 0;i < sessions[data.id].length;i++) {
		// 		socket.emit('add_desc', {'id': data.id, 'client_id': i, 'desc': sessions[data.id][i].desc});
		// 	}
		// }
	});
});

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
