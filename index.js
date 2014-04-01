(function() {
  var ncp = require("ncp").ncp;
  var fs = require("fs");
  var path = require("path");
  var tempModule = require("tmp");
  var http = require('http');
  var _appStoreURL = "ezh.ubiapps.com";
  var _appStorePort = 8084;

  var uploadToStore = function(appPath, cb) {
    var options = {
      hostname: _appStoreURL,
      port: _appStorePort,
      path: '/uploadRaw',
      method: 'POST'
    };

    var req = http.request(options, function(res) {
      var respBody = "";
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        respBody += chunk;
      });
      res.on("end", function() {
        try {
          var respCode = JSON.parse(respBody);
          if (respCode.ok) {
            cb(true, null);
          } else {
            cb(false, new Error(respCode.reason));
          }
        } catch (e) {
          cb(false, e);
        }
      });
    });

    req.on('error', function(e) {
      console.log('ubiShowMe: uploadToStore, problem with request: ' + e.message);
      cb(false, e);
    });

    var appStream = fs.createReadStream(appPath);
    appStream.pipe(req);
  };

  var createPackage = function(appDir, buildData, cb) {
    tempModule.tmpName({ postfix: ".wgt" }, function(err, archiveFile) {
      var archiver = require("archiver");

      var output = fs.createWriteStream(archiveFile);
      var archive = archiver('zip');

      output.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
        uploadToStore(archiveFile, cb);
      });

      archive.on('error', function(err){
        cb(null, err);
      });

      archive.pipe(output);
      archive.bulk([{ expand: true, cwd: appDir, src: ['**'], dest: ""}]);
      archive.finalize();
    });
  };

  var customiseApp = function(packagePath, buildData, cb) {

    // Parameterise config file.
    var configPath = path.join(packagePath, "config.xml");
    var cfg = fs.readFileSync(configPath).toString();
    // ToDo - improve id creation.
    var uid = Date.now();
    cfg = cfg.replace(/<!--%ID%-->/g, uid.toString());
    cfg = cfg.replace(/<!--%TITLE%-->/g, buildData.appConfig.title);
    cfg = cfg.replace(/<!--%DESCRIPTION%-->/g, buildData.appConfig.title);
    cfg = cfg.replace(/<!--%AUTHOR%-->/g, buildData.appConfig.author);

    if (buildData.appConfig.mode === "web") {
      // Build as background service exposing a web-server
      cfg = cfg.replace(/<!--%MODE%-->/g,' src="index.js" type="text/javascript" ');
    } else {
      // Build as stand-alone app.
      cfg = cfg.replace(/<!--%MODE%-->/g,' src="index.html" type="text/html" ');
    }
    fs.writeFileSync(configPath, cfg);

    configPath = path.join(packagePath, "config.js");
    cfg = fs.readFileSync(configPath).toString();

    var serviceList = [];
    for (var svc in buildData.appData.services) {
      if (buildData.appData.services.hasOwnProperty(svc)) {
        serviceList.push({
          zoneId: buildData.appData.services[svc].serviceAddress,
          serviceId: buildData.appData.services[svc].id
        });
      }
    }

    cfg = cfg.replace(/<!--%SERVICE_LIST%-->/g, JSON.stringify(serviceList));
    cfg = cfg.replace(/<!--%TITLE%-->/g, buildData.appConfig.title);
    fs.writeFileSync(configPath, cfg);

    if (buildData.appConfig.mode === "web") {
      // Set server http port.
      configPath = path.join(packagePath, "serverConfig.js");
      cfg = fs.readFileSync(configPath).toString();
      cfg = cfg.replace(/<!--%PORT%-->/g, buildData.appConfig.port);
      fs.writeFileSync(configPath, cfg);
    }

    createPackage(packagePath, buildData, cb);
  };

  var buildApp = function(buildData, cb) {
    console.log("ubiShowMe: building....")
    var source = path.join(__dirname,"template");
    tempModule.dir(function(err, dest) {
      if (err === null) {
        ncp(source, dest, function(err) {
          if (err) {
            cb(null, err);
          } else {
            customiseApp(dest, buildData, cb);
          }
        });
      } else {
        cb(null, err);
      }
    });
  };

  module.exports = {
    buildApp: buildApp
  };

}())
