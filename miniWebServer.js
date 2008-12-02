#!/usr/local/bin/jshost


LoadModule('jsstd');
LoadModule('jsio');
LoadModule('jsz');


var configuration = { port:8080, bind:'0.0.0.0' };

// protocol constants
const CR = '\r';
const LF = '\n';
const CRLF = CR+LF;
const SP = ' ';
const DOT = '.';
const SLASH = '/';

// mini tools
function Trim(string) /^ *(.*?) *$/(string)[1];

function Identity(arg) arg;
function Noop() {}

//
const mimeType = {
	html:'text/html',
	gif:'image/gif',
	jpeg:'image/jpeg',
	jpg:'image/jpeg',
	jpe:'image/jpeg',
	svg:'image/svg+xml'
};

const statusText = { 
	200:'OK', 
	404:'Not Found' 
};


function MimeTypeByFileName(fileName) {

	return mimeType[fileName.substr(fileName.lastIndexOf(DOT)+1)] || 'text/html; charset=iso-8859-1';
}

function Halt(message) {

	this.message = message;
}


var log = new function() {

	var _time0 = IntervalNow();
	var _file = new File('/var/log/miniWebServer.log');
	_file.Open( File.CREATE_FILE + File.WRONLY + File.APPEND );
	
	this.Write = function( data ) {
		
		var t = IntervalNow() - _time0;
		_file.Write( data );
	}
	
	this.WriteLn = function( data ) {
		
		this.Write( data + LF );
	}

	this.Close = function() {
		
		_file.Close();
	}
}


var timeout = new function() {

	var _min;
	var _tlist = {};
	this.Add = function( time, func ) {
	
		var when = IntervalNow() + time;
		while( _tlist[when] ) when++; // avoid same time
		_tlist[when] = func;
		if ( when < _min )
			_min = when;
		return when;
	}
	
	this.Remove = function(when) {
		
		if ( when == _min )
			_min = Number.POSITIVE_INFINITY;
		delete _tlist[when];
	}
	
	this.Next = function() {
		
		_min = Number.POSITIVE_INFINITY;
		for ( var w in _tlist )
			if ( w < _min )
				_min = w;
		return _min == Number.POSITIVE_INFINITY ? undefined : _min - IntervalNow();
	}

	this.Process = function() {
		
		var now = IntervalNow();
		if ( _min > now )
			return;
		for ( var [w,f] in Iterator(_tlist) )
			if ( w <= now ) {
				f();
				delete _tlist[w];
			}
	}
}

var list = [];


function CreateHttpHeaders( status, headers ) {

	var buf = 'HTTP/1.1' + SP + status + SP + statusText[status] + CRLF;
	for ( var [h,v] in Iterator(headers) )
		buf += h + ': ' + v + CRLF;
	return buf + CRLF;
}

function CloseConnection(s) {

	s.Close();
	list.splice( list.indexOf(s), 1 );
}

function NormalizeHeaderName(rawName) {

	return rawName.toLowerCase().split('-').join('');
}

function ParseHeaders(buffer) {
	
	log.WriteLn(buffer);
	try {
		var lines = buffer.split(CRLF);
		var [method,url,proto] = lines[0].split(SP);
		var httpVersion = Number(proto.split(SLASH)[1]);
		var [path,query] = url.split('?');
		var status = { method:method, url:url, httpVersion:httpVersion, path:path, query:query };
		var headers = {};
		for ( var i=1; lines[i].length; i++ ) {
			var [name,value] = lines[i].split(':');
			headers[NormalizeHeaderName(name)] = Trim(value);
		}
	} catch(error) {
		log.WriteLn('Error while parsing headers :\n'+buffer);
		throw new Halt( 'header parsing error (see log file)' );
	}
	return [ status, headers ];
}


/*
function SocketWriterHelper(s,starved,end) {
	
	var _chunkQueue = [];

	function feed() {
	
		for ( var i=0; i<arguments.length; i++ )
			_chunkQueue.push(arguments[i]);
	}
	
	function Next() {
		
		if (!starved(feed)) // continue or exit ?
			Next = function() {
				
				delete s.writable
				end && end();
			}
	}
	
	s.writable = function(s) {
		
		if ( _chunkQueue.length ) {
		
			var unsent = s.Send(_chunkQueue.shift());
			unsent.length && _chunkQueue.unshift(unsent);				
		} else
			Next();
	}
}
*/


function NormalizePath( path ) {
	
	var epath = path.split('/');
	var newPath = [];
	for each ( var name in epath )
		switch (name) {
		case '..':
			newPath.splice(-1);
			break;
		case '.':
		case '':
			break;
		default:
			newPath.push(name);
		}
	return newPath.join('/');
}


function ProcessRequest( status, headers, output, close ) {

	var root='/var/www/';
	
	var data = '';

	var file = new File( root + NormalizePath(status.path) );
	if ( !file.exist || file.info.type != File.FILE_FILE ) {

		var message = 'file not found';
		output(CreateHttpHeaders( 404, {'Content-Length':message.length, 'Content-Type':'text/plain'} ));
		output(message);
		return Noop;
	}


	return function(chunk) {
	
		data += chunk;
		
		if ( !chunk ) {

			var respondeHeaders = {};
			respondeHeaders['Content-Type'] = MimeTypeByFileName( status.path );


			var useChunksEncoding = false;
			var useKeepAliveConnection = false;
			
			
			if (status.httpVersion == 1.1) {
				useKeepAliveConnection = true;
				useChunksEncoding = true;				
			}
			
			if (useKeepAliveConnection)
				respondeHeaders['Connection'] = 'Keep-Alive';

			if (useChunksEncoding)
				respondeHeaders['Transfer-Encoding'] = 'chunked';


			var SendChunk = Identity;
			var ContentEncoding = Identity;

/*

			if ( headers.acceptencoding && headers.acceptencoding.indexOf('deflate') != -1 ) {

				respondeHeaders['Content-Encoding'] = 'deflate';
				ContentEncoding = new Z(Z.DEFLATE);
			}
*/

			file.Open( File.RDONLY );
			
			output( CreateHttpHeaders( 200, respondeHeaders ) );
			output( function(chunks) {

				var data = file.Read(Z.idealInputLength);
				
				data = ContentEncoding(data);

				if ( data.length ) {
					
					if ( useChunksEncoding )
						chunks.push( data.length.toString(16) + CRLF, data, CRLF );
					else
						chunks.push( data );

					return true; // continue
				}
				file.Close();
				return false;
			});

			if ( useChunksEncoding )
				output( '0' + CRLF + CRLF );
			
			if ( !useKeepAliveConnection )
				output(close); // close the socket
		}
	}
}




function Connection(s) {

	var _input = '';
	var _output = [];
	
	function ProcessOutput() {
	
		if ( _output.length ) {

			var dataInfo = _output[0];
			if ( dataInfo instanceof Function ) {
				var chunks = [];
				dataInfo(chunks) || _output.shift(); // ''exhausted'' function
				if ( chunks.length == 0 )
					return; // cannot shift here because the next item may be a Function
				_output = chunks.concat(_output);
			}
			s.Write( _output.shift() );
		} else
			delete s.writable;
	}
	
	function Output( dataInfo ) {
		
		_output.push(dataInfo);
		s.writable = ProcessOutput;
	}

	function Close() {

		CloseConnection(s);
	}

	function ProcessHeaders() {
	
		_input && Next('');
		s.readable = function() { 
			
			var data = s.Read();
			Next( data );
			data.length || CloseConnection(s);
		}


		function Next(chunk) {

			_input += chunk;
			var eoh = _input.indexOf( CRLF+CRLF );				
			if ( eoh == -1 )
				return;
			var [status,headers] = ParseHeaders( _input.substr(0,eoh+4) );
			status.peerName = s.peerName;
			_input = _input.substr(eoh+4);
			
			Print( status.peerName + ': ' + status.method + ' ' + status.path, '\n' );
			
			switch (status.method) {
			case 'POST':
				ProcessBody( status, headers );
				break;
			case 'GET':
				ProcessRequest( status, headers, Output, Close )('');
				break;
			}
		}
	}

	
	function ProcessBody( status, headers ) {
	
		var pr = ProcessRequest( status, headers, Output, Close );
		var length = headers.contentlength;//['content-length'];

		_input && Next('');

		s.readable = function() { 
			
			var data = s.Recv();
			Next( data );
			data.length || CloseConnection(s);
		}

		function Next(chunk) {

			_input += chunk;
	
			if ( length == undefined ) {
				
				pr(_input);
				_input = '';
				return;
			}

			if ( _input.length < length ) {
				
				length -= _input.length;
				pr(_input);
				_input = '';
			} else {
			
				pr(_input.substr(0,length));
				_input = _input.substr(length);
				pr(); // end
				ProcessHeaders();
			}
		}
	}
	
	ProcessHeaders();
}

Print( 'Try this URL: http://localhost:' + configuration.port + '/miniWebServer.html', '\n' );
Print( 'Press ctrl-c to exit...', '\n' );

try {

	var serverSocket = new Socket();

	serverSocket.readable = function() { // after Listen, readable mean incoming connexion

		var clientSocket = serverSocket.Accept();
		Connection(clientSocket);
		list.push(clientSocket);
	}

	serverSocket.Bind( configuration.port, configuration.bind );
	serverSocket.Listen();
	list.push(serverSocket);
	while (!endSignal) {
		Poll(list,timeout.Next() || 500);
		timeout.Process();
	}
	Print('end.');

} catch ( ex if ex instanceof IoError ) {
	Print( ex.text + ' ('+ex.code+')', '\n' );
} catch( ex if ex instanceof Halt ) {
	Print( 'Halt: '+ex.message,'\n' );
} catch(ex) {
	throw(ex);
}

