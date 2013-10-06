
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
app.use(express.logger('dev'));
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

//io.set('log level', 1);
io.sockets.on('connection', function (socket) {
	socket.on('desc', function(data) {
		sockets[data.id][data.client_id].emit('add_desc', data);
	});

	socket.on('cand', function(data) {
		sockets[data.id][data.client_id].emit('add_cand', {'cand': data.cand, 'client_id': data.from_client_id});
	});

	socket.on('join', function(data) {
		if (data.id !== '' && sockets[data.id] !== undefined) {
			client_id = sockets[data.id].length;
			id = data.id;
		} else if (data.id != '') {
            id = data.id;
            client_id = 0;
            sockets[id] = [];
        } else {
			var id;
			do {
				id = Math.floor(Math.random()*1000000);
			} while (id in sockets);

			client_id = 0;
			sockets[id] = [];
		}

		sockets[id].push(socket);
		socket.emit('joined', {'client_id': client_id, 'id': id});
	});
});

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
