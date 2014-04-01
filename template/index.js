var http = require("http"),
  url = require("url"),
  path = require("path"),
  fs = require("fs"),
  serverConfig = require("./serverConfig");

http.createServer(function(request, response) {
  var uri = url.parse(request.url).pathname;
  var filename = path.join(process.cwd(), uri);

  path.exists(filename, function(exists) {
    if(!exists) {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
    } else {
      if (fs.statSync(filename).isDirectory()) {
        filename += '/index.html';
      }

      fs.readFile(filename, "binary", function(err, file) {
        if(err) {
          response.writeHead(500, {"Content-Type": "text/plain"});
          response.write(err + "\n");
        } else {
          response.writeHead(200);
          response.write(file, "binary");
        }
        response.end();
      });
    }
  });
}).listen(parseInt(serverConfig.port, 10));

console.log("Server running on http://localhost:" + serverConfig.port);

