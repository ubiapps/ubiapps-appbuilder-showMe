if (typeof ubiapps === "undefined") {
  ubiapps = {};
}
if (typeof ubiapps.ubiShowMe === "undefined") {
  ubiapps.ubiShowMe = {};
}
ubiapps.ubiShowMe.serviceList = {};
ubiapps.ubiShowMe.dayLookup = ["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
ubiapps.ubiShowMe.pageSize = 100;
ubiapps.ubiShowMe.ruleDisplay = { ">": "greater than", "<": "less than", "=": "equal to", "like": "contains" };

// From http://stackoverflow.com/a/13452892
Date.prototype.format = function(format)
{
  var o = {
    "M+" : this.getMonth()+1, //month
    "d+" : this.getDate(),    //day
    "h+" : this.getHours(),   //hour
    "m+" : this.getMinutes(), //minute
    "s+" : this.getSeconds(), //second
    "q+" : Math.floor((this.getMonth()+3)/3),  //quarter
    "S" : this.getMilliseconds() //millisecond
  }

  if(/(y+)/.test(format)) format=format.replace(RegExp.$1,
    (this.getFullYear()+"").substr(4 - RegExp.$1.length));
  for(var k in o)if(new RegExp("("+ k +")").test(format))
    format = format.replace(RegExp.$1,
      RegExp.$1.length==1 ? o[k] :
        ("00"+ o[k]).substr((""+ o[k]).length));
  return format;
};

function showFeedback(msg) {
  $("#feedback").html(msg).show();
}

function loadDatasets() {
  $("#datasetList").empty().append($("<option value=''>[select...]</option>"));

  var serviceFound = function(svc) {
    var fullAddress = svc.serviceAddress + "/" + svc.id;
    if (serviceIds.hasOwnProperty(fullAddress) && !ubiapps.ubiShowMe.serviceList.hasOwnProperty(fullAddress)) {
      var option = $("<option value='" + fullAddress + "'>" + svc.displayName + "</option>");
      $("#datasetList").append(option);
      ubiapps.ubiShowMe.serviceList[fullAddress] = svc;
    }
  };

  var serviceError = function(err) {
    showFeedback("failed to find service: " + JSON.stringify(err));
  };

  var fsOptions = {timeout:12000};
  var serviceIds = {};
  window.ubiapps.ubiShowMe.config.serviceList.forEach(function (svcCfg) {
    serviceIds[svcCfg.zoneId + "/" + svcCfg.serviceId] = svcCfg;
    var fsFilter = { zoneId: [ svcCfg.zoneId ], cache: false };
  webinos.discovery.findServices(new ServiceType("http://ubiapps.com/api/ckanadapter"),{ onFound: serviceFound, onError: serviceError }, fsOptions, fsFilter)
  });
}

function initialiseSchema(schema) {
  $("#fieldList").empty().append($("<option value=''>[select...]</option>"));
  $("#compareFieldList").empty().append($("<option value=''>[select...]</option>"));
  $("#sortList").empty().append($("<option value=''>[select...]</option>"));

  for (var i = 0, len = schema.length; i < len; i++) {
    var option = $("<option>" + schema[i].id + "</option>");
    $("#fieldList").append(option);
    option = $("<option>" + schema[i].id + "</option>");
    $("#compareFieldList").append(option);
    option = $("<option>" + schema[i].id + "</option>");
    $("#sortList").append(option);
  }

  ubiapps.ubiShowMe.columns = schema.map(function(it) {
    return {
      name: it.id,
      field: it.id
    }
  });
}

function initialiseUI() {
  var schemaSuccess = function(schema) {
    initialiseSchema(schema);
  };
  var failure = function(err) {
    showFeedback("failed to get schema: " + JSON.stringify(err));
  };
  ubiapps.ubiShowMe.activeService.getSchema(schemaSuccess, failure);
}

function initialiseService() {
  reset();
  var svcId = $("#datasetList option:selected").val();
  var svc = ubiapps.ubiShowMe.serviceList[svcId];
  if (svc) {
    svc.bindService({ onBind: function(boundSvc) {
      ubiapps.ubiShowMe.activeService = boundSvc;
      initialiseUI();
    }});
  }
}

function listRules() {
  $("#ruleList").empty();
  ubiapps.ubiShowMe.rules.forEach(function(rule) {
    var ruleText;
    if (rule.literal.length === 0) {
      ruleText = rule.field1 + " " + ubiapps.ubiShowMe.ruleDisplay[rule.operator] + " " + rule.field2;
    } else {
      ruleText = rule.field1 + " " + ubiapps.ubiShowMe.ruleDisplay[rule.operator] + " " + rule.literal;
    }
    var ruleItem = $("<li>" + ruleText + "</li>");
    $("#ruleList").append(ruleItem);
  });
}

function addRule() {
  var ruleData = {};
  ruleData.field1 = $("#fieldList").val();
  ruleData.operator = $("#operatorList").val();
  ruleData.literal = $("#literal").val();
  if (ruleData.literal.length === 0) {
    ruleData.field2 = $("#compareFieldList").val();
  }

  if (!ubiapps.ubiShowMe.hasOwnProperty("rules")) {
    ubiapps.ubiShowMe.rules = [];
  }
  ubiapps.ubiShowMe.rules.push(ruleData);
  listRules();

  $("#fieldList option").eq(0).prop("selected",true);
  $("#operatorList option").eq(0).prop("selected",true);
  $("#compareFieldList option").eq(0).prop("selected",true);
  $("#literal").val("");

  return false;
}

function loadData() {
  var showMeSuccess = function(res) {
    ubiapps.ubiShowMe.data = res;
    activateView();
  };

  var rowCountSuccess = function(res) {
    if (res.length > 0) {
      ubiapps.ubiShowMe.rowCount = res[0].count;
      var start = (ubiapps.ubiShowMe.pageNum*ubiapps.ubiShowMe.pageSize);
      var end = Math.min(start + ubiapps.ubiShowMe.pageSize,ubiapps.ubiShowMe.rowCount);
      $("#rowCount").html("showing " + (start+1) +  " to " + end + " of " + ubiapps.ubiShowMe.rowCount);
      showFeedback("found " + ubiapps.ubiShowMe.rowCount);
    }
  };

  var failure = function(err) {
    showFeedback("failed to get data: " + JSON.stringify(err));
  };

  var options = {
    pageNum: ubiapps.ubiShowMe.pageNum,
    pageSize: $("#pageSize option:selected").val(),
    where: ubiapps.ubiShowMe.rules,
    combine: $("input[name=combine]:checked").val()
  };
  var sortField = $("#sortList option:selected").val();
  if (sortField.length > 0) {
    options.sort = sortField;
    options.sortDirection = $("#sortDirectionList option:selected").val();
  }
  ubiapps.ubiShowMe.activeService.getRows(options, showMeSuccess, failure);
  ubiapps.ubiShowMe.activeService.getRowCount(options, rowCountSuccess, failure);
}

function showMe() {
  showFeedback("loading...");
  ubiapps.ubiShowMe.pageNum = 0;
  showPanel($("#results"), loadData);
  return false;
}

function prevPage() {
  if (ubiapps.ubiShowMe.pageNum > 0) {
    ubiapps.ubiShowMe.pageNum--;
    loadData();
  }
}

function nextPage() {
  if (ubiapps.ubiShowMe.pageNum*ubiapps.ubiShowMe.pageSize < ubiapps.ubiShowMe.rowCount) {
    ubiapps.ubiShowMe.pageNum++;
    loadData();
  }
}

function activateView() {
  var active = $("#views").tabs("option","active");
  if (active === 0) {
    showGrid();
  } else {
    showMap();
  }
}

function showGrid() {
  ubiapps.ubiShowMe.grid = new Slick.Grid($("#slickGrid"), ubiapps.ubiShowMe.data,ubiapps.ubiShowMe.columns,  {});
}

function showMap() {
  google.maps.event.trigger(ubiapps.ubiShowMe.map, "resize");

  if (ubiapps.ubiShowMe.markerClusterer) {
    ubiapps.ubiShowMe.markerClusterer.clearMarkers();
  }

  var markers = [];
  ubiapps.ubiShowMe.data.forEach(function(rec) {
    var marker = new google.maps.Marker({
      position: new google.maps.LatLng(rec.Latitude, rec.Longitude) ,
      animation: google.maps.Animation.DROP
    });
    google.maps.event.addListener(marker, "click", function() {
      var content = "date: " + new Date(rec.Date).format("dd-MM-yyyy ") + new Date(rec.Time).format("h:mm:ss") + "<br />" +
        "day of week: " + ubiapps.ubiShowMe.dayLookup[rec.Day_of_Week] + "<br />" +
        "no. vehicles: " + rec.Number_of_Vehicles + "<br />" +
        "no. casualties: " + rec.Number_of_Casualties + "<br />" +
        "speed limit: " + rec.Speed_limit;
      ubiapps.ubiShowMe.infoWindow.setContent("<div>" + content + "</div>");
      ubiapps.ubiShowMe.infoWindow.open(ubiapps.ubiShowMe.map,marker);
    });
    markers.push(marker);
  });

  ubiapps.ubiShowMe.markerClusterer = new MarkerClusterer(ubiapps.ubiShowMe.map, markers, {});
}

function reset() {
  ubiapps.ubiShowMe.rules = [];
  listRules();

  ubiapps.ubiShowMe.data = null;

  $("#fieldList option").eq(0).prop("selected",true);
  $("#operatorList option").eq(0).prop("selected",true);
  $("#compareFieldList option").eq(0).prop("selected",true);

  hidePanel($("#results"));

  showFeedback("ready");

  return false;
}

function showPanel(header, cb) {
  var panel = $(header).next();
  if (!$(panel).is(":visible")) {
    togglePanel(header, cb);
  } else {
    if (typeof cb === "function") {
      setTimeout(cb,0);
    }
  }
}

function hidePanel(header, cb) {
  var panel = $(header).next();
  if ($(panel).is(":visible")) {
    togglePanel(header, cb);
  } else {
    if (typeof cb === "function") {
      setTimeout(cb,0);
    }
  }
}

function togglePanel(header,  cb) {
  var panel = $(header).next();
  panel.toggle({ effect: 'blind', complete: function() {
    $(header).children(".ui-icon").removeClass("ui-icon-triangle-1-s ui-icon-triangle-1-e").addClass(panel.is(":visible") ? "ui-icon-triangle-1-s" : "ui-icon-triangle-1-e");
    if (typeof cb === "function") {
      cb();
    }
  }});
}

$(function() {
  // ready...
  document.title = ubiapps.ubiShowMe.config.title + " - UbiShowMe";

  if (typeof webinos === "undefined") {
    showFeedback("webinos not loaded");
  } else {
    webinos.session.addListener("registeredBrowser",function() {
      showFeedback(webinos.session.getPZPId());
      loadDatasets();
    });
  }

  // Create the actual map control.
  var mapOptions = {
    center: new google.maps.LatLng(51.51541954569622,-0.14183521270751953),
    zoom: 8,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    navigationControl: true,
    navigationControlOptions: { style: google.maps.NavigationControlStyle.SMALL }
  };
  ubiapps.ubiShowMe.map = new google.maps.Map(document.getElementById("map"), mapOptions);
  ubiapps.ubiShowMe.infoWindow = new google.maps.InfoWindow({});

  $("#datasetList").change(initialiseService);
  $("#ruleBtn").click(addRule);
  $("#showMeBtn").click(showMe);
  $("#resetBtn").click(reset);
  $("#prevBtn").click(prevPage);
  $("#nextBtn").click(nextPage);
  $("#views").tabs({activate: activateView });
  $(".collapsible").click(function() { togglePanel(this); });
});
