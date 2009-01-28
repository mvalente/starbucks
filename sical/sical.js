#!/usr/local/bin/jshost


LoadModule('jsstd');
LoadModule('jsio');

Exec('UUID.js');


var configuration = { port:8080, address:'0.0.0.0', docroot:'/var/www/db' };

var descriptorList = [];


main();

function main()
{
   var port = configuration.port;
   var address = configuration.address;
   var httpPort = null;



   try
   {
     // Open server port
     httpPort = new Socket();
     httpPort.Bind( port, address);
  
     descriptorList.push(httpPort);


     // Setup callback to deal with incoming connections
     httpPort.readable = function() 
          {
		httpSocket = new Socket();
  		httpSocket = httpPort.Accept();
  
  		descriptorList.push(httpSocket);


  		// Setup callback to deal with incoming data
  		httpSocket.readable = function(s)
  					{
					// Print("On socket: "+s.sockName+","+s.sockPort + "\n");
					// Print("On socket: "+s.peerName+","+s.peerPort + "\n");


					// Try to read multiple times
					data='';
					while(s.available)
					{
  					  var data = data + s.Read(s.available);
					}

					// Print(data);
  					processHTTPConnectionRequest(data,s);


					// delete s.readable;
     					// CloseConnection(s);

  					}

  	}



     Print( "Waiting on port " + port + ".\n" ); 
     httpPort.Listen();


     // Process HTTP service requests in an infinite loop.
     while( !endSignal )
     {

       Poll(descriptorList, 500);

     }

     CloseConnection(httpPort);
     Print( "END" );
   }
   catch( e ) 
   {
     throw(e);
   }
}

function CloseConnection(s) 
{
        s.Close();
        descriptorList.splice( descriptorList.indexOf(s), 1 );
}


function processHTTPConnectionRequest(data,s)
{
	
	// Print('\n\n NEW REQUEST\n');
	Print(data);

	[ headers, body ] = data.split('\r\n\r\n');
	// Print(headers+'\n\n');

	headerlines = headers.split('\r\n');

 	[ method, resource, protocol] = headerlines[0].split(' ');
	// Print('METHOD: ' + method + '\n');
	// Print('RESOURCE: ' + resource + '\n');
	// Print('PROTOCOL: ' + protocol + '\n');


        switch (method) 
	{
	case 'GET':
		ProcessGet( resource, s);
		break;
	case 'POST':
		ProcessPost( resource, body, s);
		break;
	case 'PUT':
		ProcessPut( resource, body, s);
		break;
	case 'DELETE':
		ProcessDelete( resource, body, s);
		break;
	}
	// Print('---------------------' + '\n\n\n');
}

function ProcessGet(resource,s)
{
        var docroot=configuration.docroot;

	if(resource=='/')
	{
		dbs = Directory.List(docroot, Directory.SKIP_BOTH);
		reply = '{"banner": "SICAL serverside Javascript DB server", "databases": ['+dbs+']}\n';

		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);

		return;
	}
	else
	{
	  if(resource[resource.length-1]=='/')
	  {

		var dir = new File( docroot+resource );

		var disk_size= dir.info.size;
		var doc_count= Directory.List(docroot+resource).length;
		
		reply = '{"db_name": "'+resource.split('/')[1]+
			'", "doc_count": "'+doc_count+
			'", "disk_size": "'+disk_size+'"}\n';
		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);
		return;
	  }
	}

	// For CouchDB compatibility; I think it should come on server info
	if(resource=='/_all_dbs')
	{
		Print('ALL DBs \n');
		reply = Directory.List(docroot, Directory.SKIP_BOTH);

		reply = '{ '+reply+' }';

		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);

		return;
	}

	Print('AT ALL DOCS '+resource+'\n');
	if(db=/(.+)_all_docs$/(resource))
	{
		Print('ALL DOCS AT DB '+db[1]+'\n');
		Print('PATH '+docroot+db[1]+'\n');
		reply = Directory.List(docroot+db[1], Directory.SKIP_DIRECTORY);
		total_rows=reply.length;
		reply = '{"total_rows": '+total_rows+', "rows": [ '+reply+']}';

		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);

		return;
	}

        var file = new File( docroot + resource );
        if ( !file.exist || file.info.type != File.FILE_FILE ) 
	{
		Print('File not found');
		s.Write("HTTP/1.0 404 Not Found\n\n<html><body>404 error</body></html>");
		return;
        }
	file.Open( File.RDONLY );
	l = file.info.size;
	s.TransmitFile(file, false, "HTTP/1.0 200 OK\nX-ID: 123456789\nContent-Length: "+l+"\n\n")
	file.Sync();
	file.Close();

}

function ProcessPost(resource,body,s)
{
	Print('AT RESOURCE: '+resource+'\n');
	Print('SAVE DATA:\n');
	  Print(body);
	Print('\nEND DATA\n\n');

	var uuid = Math.uuid();
	Print('Saving with UUID '+uuid+'\n');


        var docroot=configuration.docroot;

        var file = new File( docroot + resource + uuid );
        file.Open( File.RDWR | File.CREATE_FILE );
	file.Write(body);
        file.Sync();
        file.Close();

	/*
        file.Open( File.RDONLY );
	l = file.info.size;
	s.TransmitFile(file, false, "HTTP/1.0 200 OK\nX-ID: 123456789\nContent-Length: "+l+"\n\n")
        file.Sync();
        file.Close();
	*/

	reply = '{"ok":true,"id":"'+uuid+'","rev":"000001"}\n';
	l = reply.length;

	s.Write("HTTP/1.0 200 OK\nX-ID: "+uuid+"\nContent-Length: "+l+"\n\n")
	s.Write(reply);

}


function ProcessPut(resource,body,s)
{

	if(resource[resource.length-1]=='/')
	{
		Print('CREATE DATABASE');
		Print('AT RESOURCE: '+resource+'\n');
        
		var docroot=configuration.docroot;

		var dir = new Directory( docroot+resource );
		
		dir.Make()
	
		reply = '{"ok":true}\n';
		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);
	}
	else
	{
	Print('AT RESOURCE: '+resource+'\n');
	Print('CHANGE DATA:\n');
	  Print(body);
	Print('\nEND DATA\n\n');


        var docroot=configuration.docroot;

        var file = new File( docroot + resource );
        file.Open( File.RDWR | File.CREATE_FILE );
	file.Write(body);
        file.Sync();
        file.Close();

        file.Open( File.RDONLY );
	l = file.info.size;
	s.TransmitFile(file, false, "HTTP/1.0 200 OK\nX-ID: 123456789\nContent-Length: "+l+"\n\n")
        file.Sync();
        file.Close();

	}

}



function ProcessDelete(resource,body,s)
{

	if(resource[resource.length-1]=='/')
	{
		Print('DELETE DATABASE');
		Print('AT RESOURCE: '+resource+'\n');
        
		var docroot=configuration.docroot;

		var dir = new Directory( docroot+resource );
		
		dir.Remove()
	
		reply = '{"ok":true}\n';
		l = reply.length;

		s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
		s.Write(reply);
	}
	else
	{
	Print('AT RESOURCE: '+resource+'\n');
	Print('DELETE DATA:\n');
	  Print(body);
	Print('\nEND DATA\n\n');

        var docroot=configuration.docroot;

        var file = new File( docroot + resource );
        file.Delete();

	reply = '{"ok":true}\n';
	l = reply.length;

	s.Write("HTTP/1.0 200 OK\nContent-Length: "+l+"\n\n")
	s.Write(reply);
	}
}













