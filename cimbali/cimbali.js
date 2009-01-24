#!/usr/local/bin/jshost


LoadModule('jsstd');
LoadModule('jsio');


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
					Print("On socket: "+s.sockName+","+s.sockPort + "\n");
					Print("On socket: "+s.peerName+","+s.peerPort + "\n");


					data='';
					while(s.available)
					{
  					  var data = data + s.Read(s.available);
					}

					Print(data);
  					processHTTPConnectionRequest(data,s);


					// delete s.readable;
     					CloseConnection(s);

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
	
	Print('\n\n NEW REQUEST\n');
	Print(data);

	[ headers, body ] = data.split('\r\n\r\n');
	// Print(headers+'\n\n');

	headerlines = headers.split('\r\n');

 	[ method, resource, protocol] = headerlines[0].split(' ');
	Print('METHOD: ' + method + '\n');
	Print('RESOURCE: ' + resource + '\n');
	Print('PROTOCOL: ' + protocol + '\n');


        switch (method) 
	{
	case 'GET':
		ProcessGet( resource, s);
		break;
	case 'POST':
		ProcessPost( resource, body, s);
		break;
	}
	Print('---------------------' + '\n\n\n');
}

function ProcessGet(resource,s)
{
        var docroot=configuration.docroot;

        var file = new File( docroot + resource );
        if ( !file.exist || file.info.type != File.FILE_FILE ) 
	{
		Print('File not found');
		s.Write("HTTP/1.0 404 Not Found\n\n<html><body>404 error</body></html>");
		return;
        }
	file.Open( File.RDONLY );
	s.TransmitFile(file, false, "HTTP/1.0 200 OK\n\n")
	file.Sync();
	file.Close();

}

function ProcessPost(resource,body,s)
{
	Print('AT RESOURCE: '+resource+'\n');
	Print('SAVE DATA:\n');
	Print(body);
	Print('\nEND DATA\n\n');

        var docroot=configuration.docroot;

        var file = new File( docroot + resource );
        file.Open( File.RDWR | File.CREATE_FILE );
	file.Write(body);
        file.Sync();
        file.Close();

        file.Open( File.RDONLY );
	s.TransmitFile(file, false, "HTTP/1.0 200 OK\nX-ID: 123456789\n\n")
        file.Sync();
        file.Close();

}














