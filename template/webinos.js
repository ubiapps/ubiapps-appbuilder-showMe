
  // TOBY: Pretend we're **NOT** on node since we want to emulate the browser scenario for service widgets.
  function isOnNode() {
    return false;
  }
  var globalExports = exports;
  var webinos = exports.webinos = {};

/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *	 http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 ******************************************************************************/

(function () {
	var logger = console;

	/**
	 * Registry for service objects. Used by RPC.
	 * @constructor
	 * @alias Registry
	 * @param parent PZH (optional).
	 */
	var Registry = function(parent) {
		this.parent = parent;

		/**
		 * Holds registered Webinos Service objects local to this RPC.
		 *
		 * Service objects are stored in this dictionary with their API url as
		 * key.
		 */
		this.objects = {};
	};

	var _registerObject = function (callback) {
		if (!callback) {
			return;
		}
		logger.log("Adding: " + callback.api);

		var receiverObjs = this.objects[callback.api];
		if (!receiverObjs)
			receiverObjs = [];

		// generate id
		var md5sum = crypto.createHash('md5');
		callback.id = md5sum.update(callback.api + callback.displayName + callback.description).digest('hex');
		
		// verify id isn't existing already
		var filteredRO = receiverObjs.filter(function(el, idx, array) {
			return el.id === callback.id;
		});
		if (filteredRO.length > 0)
			throw new Error('Cannot register, already got object with same id.');

		receiverObjs.push(callback);
		this.objects[callback.api] = receiverObjs;
	};

	/**
	 * Registers a Webinos service object as RPC request receiver.
	 * @param callback The callback object that contains the methods available via RPC.
	 */
	Registry.prototype.registerObject = function (callback) {
		_registerObject.call(this, callback);

		if (this.parent && this.parent.synchronizationStart) {
			this.parent.synchronizationStart();
		}
		return callback.id;
	};

	/**
	 * Unregisters an object, so it can no longer receives requests.
	 * @param callback The callback object to unregister.
	 */
	Registry.prototype.unregisterObject = function (callback) {
		if (!callback) {
			return;
		}
		logger.log("Removing: " + callback.api);
		var receiverObjs = this.objects[callback.api];

		if (!receiverObjs)
			receiverObjs = [];

		var filteredRO = receiverObjs.filter(function(el, idx, array) {
			return el.id !== callback.id;
		});
		if (filteredRO.length > 0) {
			this.objects[callback.api] = filteredRO;
		} else {
			delete this.objects[callback.api];
		}

		if (this.parent && this.parent.synchronizationStart) {
			this.parent.synchronizationStart();
		}
	};

	/**
	 * Get all registered objects.
	 *
	 * Objects are returned in a key-value map whith service type as key and
	 * value being an array of objects for that service type.
	 */
	Registry.prototype.getRegisteredObjectsMap = function() {
		return this.objects;
	};

	/**
	 * Get service matching type and id.
	 * @param serviceTyp Service type as string.
	 * @param serviceId Service id as string.
	 */
	Registry.prototype.getServiceWithTypeAndId = function(serviceTyp, serviceId) {
		var receiverObjs = this.objects[serviceTyp];
		if (!receiverObjs)
			receiverObjs = [];

		var filteredRO = receiverObjs.filter(function(el, idx, array) {
			return el.id === serviceId;
		});

		if (filteredRO.length < 1) {
			if (/ServiceDiscovery|ServiceConfiguration|Dashboard/.test(serviceTyp)) {
				return receiverObjs[0];
			}
			return undefined;
		}

		return filteredRO[0];
	};

	Registry.prototype.emitEvent = function(event) {
		var that = this;
		Object.keys(this.objects).forEach(function(serviceTyp) {
			if (!that.objects[serviceTyp]) return;

			that.objects[serviceTyp].forEach(function(service) {
				if (!service.listeners) return;
				if (!service.listeners[event.name]) return;

				service.listeners[event.name].forEach(function(listener) {
					try {
						listener(event);
					} catch(e) {
						console.log('service event listener error:');
						console.log(e);
					};
				});
			});
		});
	};

	// Export definitions for node.js
	if (isOnNode()){
		exports.Registry = Registry;
		var crypto = require('crypto');
	} else {
		// export for web browser
		exports.Registry = Registry;
	}
})();
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 ******************************************************************************/

(function () {
	if (typeof webinos === 'undefined')
		webinos = {};
	var _console = function(type,args){
		if(typeof module === 'undefined' && type === "log" && (typeof webinos === 'undefined' || typeof webinos.logging != 'function' || !webinos.logging())) {
			return;
		}
		(console[type]).apply(console,args);
	}
	var logger = {
		log:function(){_console("log",arguments)},
		info:function(){_console("info",arguments)},
		warn:function(){_console("warn",arguments)},
		error:function(){_console("error",arguments)},
		debug:function(){_console("debug",arguments)}
	};

	var idCount = 0;

	/**
	 * RPCHandler constructor
	 *  @constructor
	 *  @param parent The PZP object or optional else.
	 */
	var _RPCHandler = function(parent, registry) {
		/**
		 * Parent is the PZP. The parameter is not used/optional on PZH and the
		 * web browser.
		 */
		this.parent = parent;

		/**
		 * Registry of registered RPC objects.
		 */
		this.registry = registry;

		/**
		 * session id
		 */
		this.sessionId = '';

		/**
		 * Map to store callback objects on which methods can be invoked.
		 * Used by one request to many replies pattern.
		 */
		this.callbackObjects = {};

		/**
		 * Used on the client side by executeRPC to store callbacks that are
		 * invoked once the RPC finished.
		 */
		this.awaitingResponse = {};

		this.checkPolicy;

		this.messageHandler = {
			write: function() {
				logger.log("could not execute RPC, messageHandler was not set.");
			}
		};
	};

	/**
	 * Sets the writer that should be used to write the stringified JSON RPC request.
	 * @param messageHandler Message handler manager.
	 */
	_RPCHandler.prototype.setMessageHandler = function (messageHandler){
		this.messageHandler = messageHandler;
	};

	/**
	 * Create and return a new JSONRPC 2.0 object.
	 * @function
	 * @private
	 */
	var newJSONRPCObj = function(id) {
		return {
			jsonrpc: '2.0',
			id: id || getNextID()
		};
	};

	/**
	 * Creates a new unique identifier to be used for RPC requests and responses.
	 * @function
	 * @private
	 * @param used for recursion
	 */
	var getNextID = function(a) {
		// implementation taken from here: https://gist.github.com/982883
		return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,getNextID);
	};

	/**
	 * Preliminary object to hold information to create JSONRPC request object.
	 * @function
	 * @private
	 */
	var newPreRPCRequest = function(method, params) {
		var rpc = newJSONRPCObj();
		rpc.method = method;
		rpc.params = params || [];
		rpc.preliminary = true;
		return rpc;
	};

	/**
	 * Create and return a new JSONRPC 2.0 request object.
	 * @function
	 * @private
	 */
	var toJSONRPC = function(preRPCRequest) {
		if (preRPCRequest.preliminary) {
			var rpcRequest = newJSONRPCObj(preRPCRequest.id);
			rpcRequest.method = preRPCRequest.method;
			rpcRequest.params = preRPCRequest.params;
			return rpcRequest;
		} else {
			return preRPCRequest;
		}
	};

	/**
	 * Create and return a new JSONRPC 2.0 response result object.
	 * @function
	 * @private
	 */
	var newJSONRPCResponseResult = function(id, result) {
		var rpc = newJSONRPCObj(id);
		rpc.result = typeof result === 'undefined' ? {} : result;
		return rpc;
	};

	/**
	 * Create and return a new JSONRPC 2.0 response error object.
	 * @function
	 * @private
	 */
	var newJSONRPCResponseError = function(id, error) {
		var rpc = newJSONRPCObj(id);
		rpc.error = {
				data: error,
				code: -31000,
				message: 'Method Invocation returned with error'
		};
		return rpc;
	};

	/**
	 * Handles a JSON RPC request.
	 * @param request JSON RPC request object.
	 * @param from The sender.
	 * @function
	 * @private
	 */
	var handleRequest = function (request, from) {
		var isCallbackObject;

		var idx = request.method.lastIndexOf('.');
		var service = request.method.substring(0, idx);
		var method = request.method.substring(idx + 1);
		var serviceId;
		idx = service.indexOf('@');
		if (idx !== -1) {
			// extract service type and id, e.g. service@id
			var serviceIdRest = service.substring(idx + 1);
			service = service.substring(0, idx);
			var idx2 = serviceIdRest.indexOf('.');
			if (idx2 !== -1) {
				serviceId = serviceIdRest.substring(0, idx2);
			} else {
				serviceId = serviceIdRest;
			}
		} else if (!/ServiceDiscovery|ServiceConfiguration|Dashboard/.test(service)) {
			// request to object registered with registerCallbackObject
			isCallbackObject = true;
		}
		//TODO send back error if service and method is not webinos style

		if (service.length === 0) {
			logger.log("Cannot handle request because of missing service in request");
			return;
		}

		logger.log("Got request to invoke " + method + " on " + service + (serviceId ? "@" + serviceId : "") +" with params: " + JSON.stringify(request.params) );

		var includingObject;
		if (isCallbackObject) {
			includingObject = this.callbackObjects[service];
		} else {
			includingObject = this.registry.getServiceWithTypeAndId(service, serviceId);
		}

		if (!includingObject) {
			logger.log("No service found with id/type " + service);
			return;
		}

		// takes care of finding functions bound to attributes in nested objects
		idx = request.method.lastIndexOf('.');
		var methodPathParts = request.method.substring(0, idx);
		methodPathParts = methodPathParts.split('.');
		// loop through the nested attributes
		for (var pIx = 0; pIx<methodPathParts.length; pIx++) {
			if (methodPathParts[pIx] && methodPathParts[pIx].indexOf('@') >= 0) continue;
			if (methodPathParts[pIx] && includingObject[methodPathParts[pIx]]) {
				includingObject = includingObject[methodPathParts[pIx]];
			}
		}

		if (typeof includingObject === 'object') {
			var id = request.id;
			var that = this;

			var successCallback = function (result) {
				if (typeof id === 'undefined') return;
				var rpc = newJSONRPCResponseResult(id, result);
				that.executeRPC(rpc, undefined, undefined, from);
			}

			var errorCallback = function (error) {
				if (typeof id === 'undefined') return;
				var rpc = newJSONRPCResponseError(id, error);
				that.executeRPC(rpc, undefined, undefined, from);
			}

			// registration object (in case of "one request to many responses" use)
			var fromObjectRef = {
				rpcId: request.id,
				from: from
			};

			// call the requested method
			includingObject[method](request.params, successCallback, errorCallback, fromObjectRef);
		}
	};

	/**
	 * Handles a JSON RPC response.
	 * @param response JSON RPC response object.
	 * @function
	 * @private
	 */
	var handleResponse = function (response) {
		// if no id is provided we cannot invoke a callback
		if (!response.id) return;

		logger.log("Received a response that is registered for " + response.id);

		// invoking linked error / success callback
		if (this.awaitingResponse[response.id]) {
			var waitResp = this.awaitingResponse[response.id];

			if (waitResp.onResult && typeof response.result !== "undefined") {
				waitResp.onResult(response.result);
				logger.log("RPC called success callback for response");
			}
			else if (waitResp.onError && typeof response.error !== "undefined") {
				if (response.error) {
					this.awaitingResponse[response.id].onError(response.error);
				}
				else {
					this.awaitingResponse[response.id].onError();
				}
				logger.log("RPC called error callback for response");
			}
				delete this.awaitingResponse[response.id];

		} else if (this.callbackObjects[response.id]) {
			// response is for a rpc callback obj
			var callbackObj = this.callbackObjects[response.id];

			if (callbackObj.onSecurityError && response.error &&
					response.error.data && response.error.data.name === 'SecurityError') {

				callbackObj.onSecurityError(response.error.data);
				logger.log('Received SecurityError response.');
			} else {
				logger.log('Dropping received response for RPC callback obj.');
			}
		}
	};

	/**
	 * Handles a new JSON RPC message (as string)
	 * @param message The RPC message coming in.
	 * @param from The sender.
	 */
	_RPCHandler.prototype.handleMessage = function (jsonRPC, from){
		var self = this;
		logger.log("New packet from messaging");
		logger.log("Response to " + from);

		// Helper function for handling rpc
		function doRPC() {
			if (typeof jsonRPC.method !== 'undefined' && jsonRPC.method != null) {
				// received message is RPC request
				handleRequest.call(self, jsonRPC, from);
			} else {
				// received message is RPC response
				handleResponse.call(self, jsonRPC, from);
			}
		}

		// Check policy
		if (this.checkPolicy) {
			// Do policy check. Will callback when response (or timeout) received.
			this.checkPolicy(jsonRPC, from, function(isAllowed) {
				// Prompt or callback received.
				if (!isAllowed) {
					// Request denied - issue security error (to do - this doesn't propagate properly to the client).
					var rpc = newJSONRPCResponseError(jsonRPC.id, {name: "SecurityError", code: 18, message: "Access has been denied."});
					self.executeRPC(rpc, undefined, undefined, from);
				} else {
					// Request permitted - handle RPC.
					doRPC();
				}
			});
		} else {
			// No policy checking => handle RPC right now.
			doRPC();
		}
	};

	/**
	 * Executes the given RPC request and registers an optional callback that
	 * is invoked if an RPC response with same id was received.
	 * @param rpc An RPC object create with createRPC.
	 * @param callback Success callback.
	 * @param errorCB Error callback.
	 * @param from Sender.
	 */
	_RPCHandler.prototype.executeRPC = function (preRpc, callback, errorCB, from) {
		var rpc = toJSONRPC(preRpc);

		if (typeof callback === 'function' || typeof errorCB === 'function'){
			var cb = {};
			if (typeof callback === 'function') cb.onResult = callback;
			if (typeof errorCB === 'function') cb.onError = errorCB;
			if (typeof rpc.id !== 'undefined') this.awaitingResponse[rpc.id] = cb;
		}

		// service invocation case
		if (typeof preRpc.serviceAddress !== 'undefined') {
			from = preRpc.serviceAddress;
		}

		if (isOnNode()) {
			this.messageHandler.write(rpc, from);
		} else {
			// this only happens in the web browser
			webinos.session.message_send(rpc, from);
		}
	};


	/**
	 * Creates a JSON RPC 2.0 compliant object.
	 * @param service The service (e.g., the file reader or the
	 * 		  camera service) as RPCWebinosService object instance.
	 * @param method The method that should be invoked on the service.
	 * @param params An optional array of parameters to be used.
	 * @returns RPC object to execute.
	 */
	_RPCHandler.prototype.createRPC = function (service, method, params) {
		if (!service) throw "Service is undefined";
		if (!method) throw "Method is undefined";

		var rpcMethod;

		if (service.api && service.id) {
			// e.g. FileReader@cc44b4793332831dc44d30b0f60e4e80.truncate
			// i.e. (class name) @ (md5 hash of service meta data) . (method in class to invoke)
			rpcMethod = service.api + "@" + service.id + "." + method;
		} else if (service.rpcId && service.from) {
			rpcMethod = service.rpcId + "." + method;
		} else {
			rpcMethod = service + "." + method;
		}

		var preRPCRequest = newPreRPCRequest(rpcMethod, params);

		if (service.serviceAddress) {
			preRPCRequest.serviceAddress = service.serviceAddress;
		} else if (service.from) {
			preRPCRequest.serviceAddress = service.from;
		}

		return preRPCRequest;
	};

	/**
	 * Registers an object as RPC request receiver.
	 * @param callback RPC object from createRPC with added methods available via RPC.
	 */
	_RPCHandler.prototype.registerCallbackObject = function (callback) {
		if (!callback.id) {
			// can only happen when registerCallbackObject is called before
			// calling createRPC. file api impl does it this way. that's why
			// the id generated here is then used in notify method below
			// to overwrite the rpc.id, as they need to be the same
			callback.id = getNextID();
		}

		// register
		this.callbackObjects[callback.id] = callback;
	};

	/**
	 * Unregisters an object as RPC request receiver.
	 * @param callback The callback object to unregister.
	 */
	_RPCHandler.prototype.unregisterCallbackObject = function (callback) {
		delete this.callbackObjects[callback.id];
	};

	/**
	 * Registers a policy check function.
	 * @param checkPolicy
	 */
	_RPCHandler.prototype.registerPolicycheck = function (checkPolicy) {
		this.checkPolicy = checkPolicy;
	};

	/**
	 * Utility method that combines createRPC and executeRPC.
	 * @param service The service (e.g., the file reader or the
	 * 		  camera service) as RPCWebinosService object instance.
	 * @param method The method that should be invoked on the service.
	 * @param objectRef RPC object reference.
	 * @param successCallback Success callback.
	 * @param errorCallback Error callback.
	 * @returns Function which when called does the rpc.
	 */
	_RPCHandler.prototype.request = function (service, method, objectRef, successCallback, errorCallback) {
		var self = this; // TODO Bind returned function to "this", i.e., an instance of RPCHandler?

		function callback(maybeCallback) {
			if (typeof maybeCallback !== "function") {
				return function () {};
			}
			return maybeCallback;
		}

		return function () {
			var params = Array.prototype.slice.call(arguments);
			var message = self.createRPC(service, method, params);

			if (objectRef && objectRef.api)
				message.id = objectRef.api;
			else if (objectRef)
				message.id = objectRef;

			self.executeRPC(message, callback(successCallback), callback(errorCallback));
		};
	};

	/**
	 * Utility method that combines createRPC and executeRPC.
	 *
	 * For notification only, doesn't support success or error callbacks.
	 * @param service The service (e.g., the file reader or the
	 * 		  camera service) as RPCWebinosService object instance.
	 * @param method The method that should be invoked on the service.
	 * @param objectRef RPC object reference.
	 * @returns Function which when called does the rpc.
	 */
	_RPCHandler.prototype.notify = function (service, method, objectRef) {
		return this.request(service, method, objectRef, function(){}, function(){});
	};

	/**
	 * RPCWebinosService object to be registered as RPC module.
	 *
	 * The RPCWebinosService has fields with information about a Webinos service.
	 * It is used for three things:
	 * 1) For registering a webinos service as RPC module.
	 * 2) The service discovery module passes this into the constructor of a
	 *	webinos service on the client side.
	 * 3) For registering a RPC callback object on the client side using ObjectRef
	 *	as api field.
	 * When registering a service the constructor should be called with an object
	 * that has the following three fields: api, displayName, description. When
	 * used as RPC callback object, it is enough to specify the api field and set
	 * that to ObjectRef.
	 * @constructor
	 * @param obj Object with fields describing the service.
	 */
	var RPCWebinosService = function (obj) {
		this.listeners = {};
		if (!obj) {
			this.id = '';
			this.api = '';
			this.displayName = '';
			this.description = '';
			this.serviceAddress = '';
		} else {
			this.id = obj.id || '';
			this.api = obj.api || '';
			this.displayName = obj.displayName || '';
			this.description = obj.description || '';
			this.serviceAddress = obj.serviceAddress || '';
		}
	};

	/**
	 * Get an information object from the service.
	 * @returns Object including id, api, displayName, serviceAddress.
	 */
	RPCWebinosService.prototype.getInformation = function () {
		return {
			id: this.id,
			api: this.api,
			displayName: this.displayName,
			description: this.description,
			serviceAddress: this.serviceAddress
		};
	};

	RPCWebinosService.prototype._addListener = function (event, listener) {
		if (!event || !listener) throw new Error('missing event or listener');

		if (!this.listeners[event]) this.listeners[event] = [];
		this.listeners[event].push(listener);
	};

	RPCWebinosService.prototype._removeListener = function (event, listener) {
		if (!event || !listener) return;
		this.listeners[event].forEach(function(l, i) {
			if (l === listener) this.listeners[event][i] = null;
		});
	};

	/**
	 * Webinos ServiceType from ServiceDiscovery
	 * @constructor
	 * @param api String with API URI.
	 */
	var ServiceType = function(api) {
		if (!api)
			throw new Error('ServiceType: missing argument: api');

		this.api = api;
	};

	/**
	 * Set session id.
	 * @param id Session id.
	 */
	_RPCHandler.prototype.setSessionId = function(id) {
		this.sessionId = id;
	};

	/**
	 * Export definitions for node.js
	 */
	if (isOnNode()){
		exports.RPCHandler = _RPCHandler;
		exports.Registry = require('./registry.js').Registry;
		exports.RPCWebinosService = RPCWebinosService;
		exports.ServiceType = ServiceType;

	} else {
		// export for web browser
		exports.RPCHandler = _RPCHandler;
    exports.RPCWebinosService = RPCWebinosService;
    exports.ServiceType = ServiceType;
	}
})();
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*
* Copyright 2012 Ziran Sun, Samsung Electronics(UK) Ltd
******************************************************************************/
(function ()	{
"use strict";
  var logger = console;
  if (isOnNode()) {
    logger= require("./logging.js")(__filename);
  }

    function logMsg(name, message) {
        logger.log(name + '\n from: ' + message.from + '\n to:' + message.to + '\n resp_to:' + message.resp_to);
    }

	/** Message fields:
	 *
	 * var message = {
	 * register: false    //register sender if true
	 * ,type: "JSONRPC"   // JSONRPC message or other
	 * ,id:   0           // messageid used to
	 * ,from:  null       // sender address
	 * ,to:    null       // reciever address
	 * ,resp_to:   null   // the destination to pass RPC result back to
	 * ,timestamp:  0     // currently this parameter is not used
	 * ,timeout:  null    // currently this parameter is not used
	 * ,payload:  null    // message body - RPC object
	 * };
	 */

	/** Address description:

	 * address format in current session Manager code - PZH/PZP/appid/instanceid
	 * address format defined in http://dev.webinos.org/redmine/projects/wp4/wiki/Entity_Naming_for_Messaging is:
	 * https://her_domain.com/webinos/other_user/urn:services-webinos-org:calender
	 *
	 * other_user@her_domain.com                        <-- name of user identity (PZH?)
	 *  |
	 * +-- laptop                                     <-- name of the PZP
	 *         |
	 *        +-- urn:services-webinos-org:calender    <-- service type
	 *              |
	 *              +-- A0B3
	 * other_user@her_domain.com/laptop/urn:services-webinos-org:calender/
	 */

	/**
	 * MessageHandler constructor
	 *  @constructor
	 *  @param rpcHandler RPC handler manager.
	 */
	var MessageHandler = function (rpcHandler) {
		this.sendMsg = null;

		this.ownSessionId = null;
		this.separator = null;

		this.rpcHandler = rpcHandler;
		this.rpcHandler.setMessageHandler(this);

		/**
		 * To store the session id after registration. e.g. PZP registers with
		 * PZH, PZH creates a session id X for PZP. client[PZP->PZH] = X
		 *
		 *  TODO need to adjust clients[] to accommodate PZH farm, PZP farm scenarios
		 */
		this.clients = {};
	};

	/**
	 * Set the sendMessage function that should be used to send message.
	 * Developers use this function to call different sendmessage APIs under
	 * different communication environment. e.g. in socket.io, the
	 * sendMessageFunction could be: io.sockets.send(sessionid);
	 * @param sendMessageFunction A function that used for sending messages.
	 */
	MessageHandler.prototype.setSendMessage = function (sendMessageFunction) {
		this.sendMsg = sendMessageFunction;
	};

	/**
	 * Function to set own session identity.
	 * @param ownSessionId pz session id
	 */
	MessageHandler.prototype.setOwnSessionId = function (ownSessionId) {
		this.ownSessionId = ownSessionId;
	};

	/**
	 * Function to get own session identity.
	 */
	MessageHandler.prototype.getOwnSessionId = function () {
		return this.ownSessionId;
	};

	/**
	 * Set separator used to in Addressing to separator different part of the address.
	 * e.g. PZH/PZP/APPID, "/" is the separator here
	 * @param sep The separator that used in address representation
	 */

	MessageHandler.prototype.setSeparator = function (sep) {
		this.separator = sep;
	};

	/**
	 *  Create a register message.
	 *  Use the created message to send it to an entity, this will setup a session
	 *  on the receiver side. The receiver will then route messages to the
	 *  sender of this message.
	 *  @param from Message originator
	 *  @param to  Message destination
	 */
	MessageHandler.prototype.createRegisterMessage = function(from, to) {
		logger.log('creating register msg to send from ' + from + ' to ' + to);
		if (from === to) throw new Error('cannot create register msg to itself');

		var msg = {
			register: true,
			to: to,
			from: from,
			type: 'JSONRPC',
			payload: null
		};

		return msg;
	};

	/**
	 *  Remove stored session route. This function is called once session is closed.
	 *  @param sender Message sender or forwarder
	 *  @param receiver Message receiver
	 */
	MessageHandler.prototype.removeRoute = function (sender, receiver) {
		var session = [sender, receiver].join("->");
		if (this.clients[session]) {
            logger.log("deleted "+session);
			delete this.clients[session];
		}
	};

	/**
	 * Returns true if msg is a msg for app on wrt connected to this pzp.
	 */
	function isLocalAppMsg(msg) {
		var ownId = this.ownSessionId.split(this.separator);
		var toId  = msg.to.split(this.separator);
        if (/\/(?:[BI]ID)?[a-f0-9]+:\d+/.exec(msg.to) // check it has WRT app id
				&& /\//.exec(this.ownSessionId) // must include "/" to be pzp
				&& ownId.length > 1 && toId.length > 1
				&& ownId[0] === toId[0] && ownId[1] === toId[1]) {
			return true;
		}
		return false;
	}

	/**
	 * Somehow finds out the PZH address and returns it?
	 */
	function getPzhAddr(message) {
		// check occurances of separator used in addressing
		var data = message.to.split(this.separator);
		var occurences = data.length - 1;
		var id = data[0];
		var forwardto = data[0];

		// strip from right side
		for (var i = 1; i < occurences; i++) {
			id = id + this.separator + data[i];
			var new_session1 = [id, this.ownSessionId].join("->");
			var new_session2 = [this.ownSessionId, id].join("->");

			if (this.clients[new_session1] || this.clients[new_session2]) {
				forwardto = id;
			}
		}

		if (forwardto === data[0]) {
			var s1 = [forwardto, this.ownSessionId].join("->");
			var s2 = [this.ownSessionId, forwardto].join("->");
			if (this.clients[s1] || this.clients[s2])
				forwardto = data[0];
			else
			{
				var own_addr = this.ownSessionId.split(this.separator);
				var own_pzh = own_addr[0]
				if (forwardto !== own_pzh) {
					forwardto = own_pzh;
				}
			}
		}
		return forwardto;
	}
	function isSameZonePzp(address){
		var ownId = this.ownSessionId.split(this.separator);
		var toId  = address.split(this.separator);
		return !!(ownId.length === 2 && toId.length === 2 && toId[0] === ownId[0]);
	}

	/**
	 * RPC writer - referto write function in  RPC
	 * @param rpc Message body
	 * @param to Destination for rpc result to be sent to
	 */
	MessageHandler.prototype.write = function (rpc, to) {
		if (!to) throw new Error('to is missing, cannot send message');

		var message = {
			to: to,
			resp_to: this.ownSessionId,
			from: this.ownSessionId
		};

		if (typeof rpc.jsonrpc !== "undefined") {
			message.type = "JSONRPC";
		}

		message.payload = rpc;

		var session1 = [to, this.ownSessionId].join("->");
		var session2 = [this.ownSessionId, to].join("->");

		if ((!this.clients[session1]) && (!this.clients[session2])) { // not registered either way
			logger.log("session not set up");
			var forwardto = /*isSameZonePzp.call(this, to) ? to: */ getPzhAddr.call(this, message);
			if (forwardto === this.ownSessionId) {
				logger.log('drop message, never forward to itself');
				return;
			}

			if (isLocalAppMsg.call(this, message)) {
				// msg from this pzp to wrt previously connected to this pzp
				logger.log('drop message, wrt disconnected');
				return;
			}

			logger.log("message forward to:" + forwardto);
			this.sendMsg(message, forwardto);
		}
		else if (this.clients[session2]) {
			logger.log("clients[session2]:" + this.clients[session2]);
			this.sendMsg(message, this.clients[session2]);
		}
		else if (this.clients[session1]) {
			logger.log("clients[session1]:" + this.clients[session1]);
			this.sendMsg(message, this.clients[session1]);
		}
	};

	/**
	 *  Handle message routing on receiving message. it does -
	 *  [1] Handle register message and create session path for newly registered party
	 *  [2] Forward messaging if not message destination
	 *  [3] Handle message  by calling RPC handler if it is message destination
	 *  @param message	Received message
	 *  @param sessionid session id
	 */
	MessageHandler.prototype.onMessageReceived = function (message, sessionid) {
		if (typeof message === "string") {
			try {
				message = JSON.parse(message);
			} catch (e) {
				log.error("JSON.parse (message) - error: "+ e.message);
			}
		}

		if (message.hasOwnProperty("register") && message.register) {
			var from = message.from;
			var to = message.to;
			if (to !== undefined) {
				var regid = [from, to].join("->");

				//Register message to associate the address with session id
				if (message.from) {
					this.clients[regid] = message.from;
				}
				else if (sessionid) {
					this.clients[regid] = sessionid;
				}

				logger.log("register Message");
			}
			return;
		}
		// check message destination
		else if (message.hasOwnProperty("to") && (message.to)) {

			//check if a session with destination has been stored
			if(message.to !== this.ownSessionId) {
				logger.log("forward Message " + message.to + " own Id -" +this.ownSessionId + " client list"+this.clients);

				//if no session is available for the destination, forward to the hop nearest,
				//i.e A->D, if session for D is not reachable, check C, then check B if C is not reachable
				var to = message.to;
				var session1 = [to, this.ownSessionId].join("->");
				var session2 = [this.ownSessionId, to].join("->");

				// not registered either way
				if ((!this.clients[session1]) && (!this.clients[session2])) {
					var forwardto = /*isSameZonePzp.call(this, to) ? to:  */getPzhAddr.call(this, message);
					if (forwardto === this.ownSessionId) {
						logMsg('drop message, never forward to self. msg details:', message);
						return;
					}

					if (isLocalAppMsg.call(this, message)) {
						// msg from other pzp to wrt previously connected to this pzp
						logMsg('drop message, adressed wrt disconnected. msg details:', message);
						return;
					}

					logger.log("message forward to:" + forwardto);
					this.sendMsg(message, forwardto);
				}
				else if (this.clients[session2]) {
					this.sendMsg(message, this.clients[session2]);
				}
				else if (this.clients[session1]) {
					this.sendMsg(message, this.clients[session1]);
				}
				return;
			}
			//handle message on itself
			else {
				if (message.payload) {
					if(message.to != message.resp_to) {
						var from = message.from;
						this.rpcHandler.handleMessage(message.payload, from);
					}
					else {
						if (typeof message.payload.method !== "undefined") {
							var from = message.from;
							this.rpcHandler.handleMessage(message.payload, from);
						}
						else {
							if (typeof message.payload.result !== "undefined" || typeof message.payload.error !== "undefined") {
								this.rpcHandler.handleMessage(message.payload);
							}
						}
					}
				}
				else {
					// what other message type are we expecting?
				}
				return;
			}
			return;
		}
	};

	// TODO add fucntion to release clients[] when session is closed -> this will also affect RPC callback funcs

	/**
	 * Export messaging handler definitions for node.js
	 */
	if (typeof exports !== 'undefined') {
		exports.MessageHandler = MessageHandler;
	} else {
		// export for web browser
    exports.MessageHandler = MessageHandler;
	}

}());
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 * Copyright 2012 - 2013 Samsung Electronics (UK) Ltd
 * Authors: Habib Virji
 ******************************************************************************/
if (typeof exports === "undefined") exports = window;
if (typeof exports.webinos === "undefined") exports.webinos = {};
if (typeof exports.webinos.session === "undefined") exports.webinos.session = {};
if (typeof exports.webinos.logging === "undefined") exports.webinos.logging = function(enable){
    if(typeof enable === "boolean") {
        enable ? localStorage.setItem("verboseLoggingEnabled","true") : localStorage.removeItem("verboseLoggingEnabled");
    }
    return (typeof localStorage != "undefined" && localStorage && "true" === localStorage.getItem("verboseLoggingEnabled"));
};

if (typeof _webinos === "undefined") {
    _webinos = {};
    _webinos.registerServiceConstructor = function(){};
}

(function() {
    "use strict";

    var sessionId = null, pzpId, pzhId, connectedDevices =[], isConnected = false, enrolled = false, mode, port = 8080,
        serviceLocation, webinosVersion,listenerMap = {}, channel, pzhWebAddress = "https://pzh.webinos.org/";
    function callListenerForMsg(data) {
        var listeners = listenerMap[data.payload.status] || [];
        for(var i = 0;i < listeners.length;i++) {
            listeners[i](data) ;
        }
    }
    function setWebinosMessaging() {
        webinos.messageHandler.setOwnSessionId(sessionId);
        var msg = webinos.messageHandler.createRegisterMessage(pzpId, sessionId);
        webinos.messageHandler.onMessageReceived(msg, msg.to);
    }
    function updateConnected(message){
        if (message.pzhId) pzhId = message.pzhId;
        if (message.connectedDevices) connectedDevices = message.connectedDevices;
        if (message.enrolled) enrolled = message.enrolled;
        if (message.state) mode = message.state;
        if (mode)  isConnected = (mode["Pzh"] === "connected" || mode["Pzp"] === "connected");
        if (message.hasOwnProperty("pzhWebAddress")) {
            webinos.session.setPzhWebAddress(message.pzhWebAddress);
        } 
    }
    function setWebinosSession(data){
        sessionId = data.to;
        pzpId     = data.from;
        if(data.payload.message) {
            updateConnected(data.payload.message);
        }
        setWebinosMessaging();
    }
    function setWebinosVersion(data) {
        webinosVersion = data.payload.message;
    }
    webinos.session.setChannel = function(_channel) {
        channel = _channel;
    };
    webinos.session.setPzpPort = function (port_) {
        port = port_;
    };
    webinos.session.getPzpPort = function () {
        return port;
    };
    webinos.session.setPzhWebAddress = function (pzhWebAddress_) {
        pzhWebAddress = pzhWebAddress_;
    };
    webinos.session.getPzhWebAddress = function () {
        return pzhWebAddress;
    };
    webinos.session.message_send_messaging = function(msg, to) {
        msg.resp_to = webinos.session.getSessionId();
        channel.sendUTF(JSON.stringify(msg));
    };
    webinos.session.message_send = function(rpc, to) {
        var type;
        if(rpc.type !== undefined && rpc.type === "prop") {
            type = "prop";
            rpc = rpc.payload;
        }else {
            type = "JSONRPC";
        }
        if (typeof to === "undefined") {
            to = pzpId;
        }
        var message = {"type":type,
            "from":webinos.session.getSessionId(),
            "to":to,
            "resp_to":webinos.session.getSessionId(),
            "payload":rpc};
        if(rpc.register !== "undefined" && rpc.register === true) {
            if(webinos.logging()) {
                console.log(rpc);
            }
            channel.sendUTF(JSON.stringify(rpc));
        }else {
            if(webinos.logging()) {
                console.log("WebSocket Client: Message Sent", message);
            }
            channel.sendUTF(JSON.stringify(message));
        }
    };
    webinos.session.setServiceLocation = function (loc) {
        serviceLocation = loc;
    };
    webinos.session.getServiceLocation = function () {
        if (typeof serviceLocation !== "undefined") {
            return serviceLocation;
        } else {
            return pzpId;
        }
    };
    webinos.session.getSessionId = function () {
        return sessionId;
    };
    webinos.session.getPZPId = function () {
        return pzpId;
    };
    webinos.session.getPZHId = function () {
        return ( pzhId || "");
    };
    webinos.session.getConnectedDevices = function () {
        return (connectedDevices || []);
    };
    webinos.session.getConnectedPzh = function () {
       var list =[];
       if(pzhId) {
         for (var i = 0 ; i < connectedDevices.length; i = i + 1){
             list.push(connectedDevices[i].id);
         }
       }
       return list;
    };
    webinos.session.getConnectedPzp = function () {
        var list =[];
        if (connectedDevices){
           for (var i = 0 ; i < connectedDevices.length; i = i + 1){
            if(!pzhId) {
                  list.push(connectedDevices[i]);
            } else {
              for (var j = 0; j < (connectedDevices[i].pzp && connectedDevices[i].pzp.length); j = j + 1){
                  list.push(connectedDevices[i].pzp[j]);
              }
           }
          }
        }
        return list;
    };
    webinos.session.getFriendlyName = function(id){
        for (var i = 0 ; i < connectedDevices.length; i = i + 1){
            if(connectedDevices[i] === id || connectedDevices[i].id === id) {
                return connectedDevices[i].friendlyName;
            }
            for (var j = 0 ; j < (connectedDevices[i].pzp && connectedDevices[i].pzp.length); j = j + 1){
                if(connectedDevices[i].pzp[j].id === id) {
                    return connectedDevices[i].pzp[j].friendlyName;
                }
            }
        }
    };
    webinos.session.addListener = function (statusType, listener) {
        var listeners = listenerMap[statusType] || [];
        listeners.push (listener);
        listenerMap[statusType] = listeners;
        return listeners.length;
    };
    webinos.session.removeListener = function (statusType, id) {
        var listeners = listenerMap[statusType] || [];
        try {
            listeners[id - 1] = undefined;
        } catch (e) {
        }
    };
    webinos.session.isConnected = function () {
        return isConnected;
    };
    webinos.session.getPzpModeState = function (mode_name) {
        return  (enrolled && mode[mode_name] === "connected");
    };
    webinos.session.getWebinosVersion = function() {
        return webinosVersion;
    };
    webinos.session.handleMsg = function(data) {
        if(typeof data === "object" && data.type === "prop") {
            switch(data.payload.status) {
                case "webinosVersion":
                case "update":
                case "registeredBrowser":
                    setWebinosSession(data);
                case "pzpFindPeers":
                case "pubCert":
                case "showHashQR":
                case "addPzpQR":
                case "requestRemoteScanner":
                case "checkHashQR":
                case "sendCert":
                case "connectPeers":
                case "intraPeer":
                case "infoLog":
                case "errorLog":
                case "error":
                case "friendlyName":
                case "gatherTestPageLinks":
                    callListenerForMsg(data);
                    break;
                case "pzhDisconnected":
                    isConnected = false;
                    callListenerForMsg(data);
                    break;
            }
        }
    }
}());
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 ******************************************************************************/
(function () {
    var channel = null;

    var _console = function(type,args){
        if(typeof module === 'undefined' && type === "log" && (typeof webinos === 'undefined' || typeof webinos.logging != 'function' || !webinos.logging())) {
            return;
        }
        (console[type]).apply(console,args);
    }
    var logger = {
        log:function(){_console("log",arguments)},
        info:function(){_console("info",arguments)},
        warn:function(){_console("warn",arguments)},
        error:function(){_console("error",arguments)},
        debug:function(){_console("debug",arguments)}
    };

    /**
     * Creates the socket communication channel
     * for a locally hosted websocket server at port 8080
     * for now this channel is used for sending RPC, later the webinos
     * messaging/eventing system will be used
     */
    function createCommChannel (successCB) {
        var channel = null;
        if (typeof WebinosSocket !== 'undefined') { // Check if we are inside Android widget renderer.
            channel = new WebinosSocket ();
        } else { // We are not in Android widget renderer so we can use a browser websocket.
            var port, hostname;
            var defaultHost = "localhost";
            var defaultPort = "8080";
            var isWebServer = true;
            var useDefaultHost = false;
            var useDefaultPort = false;

            // Get web server info.

            // Get web server port.
            port = 8080; //window.location.port - 0 || 80;
            // Find web server hostname.
            hostname = "localhost"; //window.location.hostname;
            if (hostname == "") isWebServer = false; // We are inside a local file.
            if(hostname !== "localhost" && hostname !=="127.0.0.1") {
            logger.log("websocket connection is only possible with address localhost or 127.0.0.1. Please change to localhost or 127.0.0.1 " +
                  "to connect to the PZP");
            }

            // Find out the communication socket info.

            // Set the communication channel's port.
            if (isWebServer) {
                try {
                    var xmlhttp = new XMLHttpRequest ();
                    xmlhttp.open ("GET", "/webinosConfig.json", false);
                    xmlhttp.send ();
                    if (xmlhttp.status == 200) {
                        var resp = JSON.parse (xmlhttp.responseText);
                        port = resp.websocketPort;
                    } else { // We are not inside a pzp or widget server.
                        logger.log ("CAUTION: webinosConfig.json failed to load. Are you on a pzp/widget server or older version of webinos? Trying the guess  communication channel's port.");
                        port = port + 1; // Guessing that the port is +1 to the webserver's. This was the way to detect it on old versions of pzp.
                    }
                } catch (err) { // XMLHttpRequest is not supported or something went wrong with it.
                    logger.log ("CAUTION: The pzp communication host and port are unknown. Trying the default communication channel.");
                    useDefaultHost = true;
                    useDefaultPort = true;
                }
            } else { // Let's try the default pzp hostname and port.
                logger.log ("CAUTION: No web server detected. Using a local file? Trying the default communication channel.");
                useDefaultHost = true;
                useDefaultPort = true;
            }
            // Change the hostname to the default if required.
            if (useDefaultHost) hostname = defaultHost;
            // Change the port to the default if required.
            if (useDefaultPort) port = defaultPort;

            // We are ready to make the connection.

            // Get the correct websocket object.
//            var ws = window.WebSocket || window.MozWebSocket;
//            try {
//                channel = new ws ("ws://" + hostname + ":" + port);
//            } catch (err) { // Websockets are not available for this browser. We need to investigate in order to support it.
//                throw new Error ("Your browser does not support websockets. Please report your browser on webinos.org.");
//            }
             var WSClient = require("websocket").client;
             channel = new WSClient();
        }
        webinos.session.setPzpPort (port);

        channel.on("connect", function(connection) {
          connection.on("message", function (ev) {
              logger.log ('WebSocket Client: Message Received : ' + JSON.stringify (ev.data));
              var data = JSON.parse (ev.utf8Data);
              if (data.type === "prop") {
                  webinos.session.handleMsg (data);
              } else {
                  //webinos.messageHandler.setOwnSessionId (webinos.session.getSessionId ());
                  //webinos.messageHandler.setSendMessage (webinos.session.message_send_messaging);
                  webinos.messageHandler.onMessageReceived (data, data.to);
              }
          });
          connection.onerror = function(evt) {
            console.error("WebSocket error", evt);
          };

          webinos.session.setChannel (connection);
          var url = "localServiceWidget";
          var origin = "localServiceWidgetOrigin";
          webinos.session.message_send({type: 'prop', payload: {status:'registerBrowser', value: url, origin: origin}});
        });

        channel.connect("ws://localhost:8080/");
    }

    createCommChannel ();

    webinos.rpcHandler = new exports.RPCHandler (undefined, new exports.Registry ());
    webinos.messageHandler = new exports.MessageHandler (webinos.rpcHandler);

} ());
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 ******************************************************************************/

(function(exports) {

    var WebinosService = function (obj) {
        globalExports.RPCWebinosService.call(this, obj);
    };

    WebinosService.prototype.state = {};
    WebinosService.prototype.icon = '';

    // stub implementation in case a service module doesn't provide its own bindService
    WebinosService.prototype.bindService = function(bindCB) {
        if (typeof bindCB === 'undefined') return;

        if (typeof bindCB.onBind === 'function') {
            bindCB.onBind(this);
        }
    };
    WebinosService.prototype.bind = WebinosService.prototype.bindService;

    WebinosService.prototype.unbindService = function(){};
    WebinosService.prototype.unbind = WebinosService.prototype.unbindService;

    exports.WebinosService = WebinosService;

})(exports);
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
 ******************************************************************************/

(function () {

    var typeMap = {};

    var registerServiceConstructor = function(serviceType, Constructor) {
        typeMap[serviceType] = Constructor;
    };
    if (typeof _webinos !== 'undefined') _webinos.registerServiceConstructor = registerServiceConstructor;

    if (isOnNode()) {
       var Context = require(path.join(webinosRoot, dependencies.wrt.location, 'lib/webinos.context.js')).Context;
    }

    /**
     * Interface DiscoveryInterface
     */
    var ServiceDiscovery = function (rpcHandler) {
        var _webinosReady = false;
        var callerCache = [];

        /**
         * Search for installed APIs.
         * @param apiNameFilter String to filter API names.
         * @param successCB Callback to call with results.
         * @param errorCB Callback to call in case of error.
         */
        this.findConfigurableAPIs = function(apiNameFilter, successCB, errorCB) {
            //Calls to this method can be constrained using dashboard's feature
            var rpc = rpcHandler.createRPC('ServiceDiscovery', 'findConfigurableAPIs', [{'api':'http://webinos.org/api/dashboard'}, apiNameFilter]);
            rpcHandler.executeRPC(rpc
                    , function (params) { successCB(params); }
                    , function (params) { errorCB(params); }
            );
        };

        /**
         * Search for registered services.
         * @param {ServiceType} serviceType ServiceType object to search for.
         * @param {FindCallBack} callback Callback to call with results.
         * @param {Options} options Timeout, optional.
         * @param {Filter} filter Filters based on location, name, description, optional.
         */
        this.findServices = function (serviceType, callback, options, filter) {
            var that = this;
            var findOp;

            var typeMapCompatible = {};
            //if (typeof ActuatorModule !== 'undefined') typeMapCompatible['http://webinos.org/api/actuators'] = ActuatorModule;
            //if (typeof App2AppModule !== 'undefined') typeMapCompatible['http://webinos.org/api/app2app'] = App2AppModule;
            //if (typeof AppLauncherModule !== 'undefined') typeMapCompatible['http://webinos.org/api/applauncher'] = AppLauncherModule;
            if (typeof AuthenticationModule !== 'undefined') typeMapCompatible['http://webinos.org/api/authentication'] = AuthenticationModule;
            if (typeof webinos.Context !== 'undefined') typeMapCompatible['http://webinos.org/api/context'] = webinos.Context;
            if (typeof corePZinformationModule !== 'undefined') typeMapCompatible['http://webinos.org/api/corePZinformation'] = corePZinformationModule;
            //if (typeof DeviceStatusManager !== 'undefined') typeMapCompatible['http://webinos.org/api/devicestatus'] = DeviceStatusManager;
            //if (typeof DiscoveryModule !== 'undefined') typeMapCompatible['http://webinos.org/api/discovery'] = DiscoveryModule;
            //if (typeof EventsModule !== 'undefined') typeMapCompatible['http://webinos.org/api/events'] = EventsModule;
            //if (webinos.file && webinos.file.Service) typeMapCompatible['http://webinos.org/api/file'] = webinos.file.Service;
            //if (typeof MediaContentModule !== 'undefined') typeMapCompatible['http://webinos.org/api/mediacontent'] = MediaContentModule;
            //if (typeof NfcModule !== 'undefined') typeMapCompatible['http://webinos.org/api/nfc'] = NfcModule;
            //if (typeof WebNotificationModule !== 'undefined') typeMapCompatible['http://webinos.org/api/notifications'] = WebNotificationModule;
            //if (typeof WebinosDeviceOrientation !== 'undefined') typeMapCompatible['http://webinos.org/api/deviceorientation'] = WebinosDeviceOrientation;
            //if (typeof PaymentModule !== 'undefined') typeMapCompatible['http://webinos.org/api/payment'] = PaymentModule;
            //if (typeof Sensor !== 'undefined') typeMapCompatible['http://webinos.org/api/sensors'] = Sensor;
            //if (typeof TestModule !== 'undefined') typeMap['http://webinos.org/api/test'] = TestModule;
            //if (typeof TVManager !== 'undefined') typeMapCompatible['http://webinos.org/api/tv'] = TVManager;
            //if (typeof Vehicle !== 'undefined') typeMapCompatible['http://webinos.org/api/vehicle'] = Vehicle;
            //if (typeof WebinosGeolocation !== 'undefined') typeMapCompatible['http://webinos.org/api/w3c/geolocation'] = WebinosGeolocation;
            //if (typeof WebinosGeolocation !== 'undefined') typeMapCompatible['http://www.w3.org/ns/api-perms/geolocation'] = WebinosGeolocation; // old feature URI for compatibility
			// We use http://webinos.org/api/contacts instead of the w3c one... 
            //if (typeof Contacts !== 'undefined') typeMapCompatible['http://www.w3.org/ns/api-perms/contacts'] = Contacts;
            //if (typeof ZoneNotificationModule !== 'undefined') typeMapCompatible['http://webinos.org/api/zonenotifications'] = ZoneNotificationModule;
            //if (typeof DiscoveryModule !== 'undefined') typeMapCompatible['http://webinos.org/manager/discovery/bluetooth'] = DiscoveryModule;
            if (typeof oAuthModule !== 'undefined') typeMapCompatible['http://webinos.org/mwc/oauth'] = oAuthModule;
            //if (typeof PolicyManagementModule !== 'undefined') typeMapCompatible['http://webinos.org/core/policymanagement'] = PolicyManagementModule;


            var rpc = rpcHandler.createRPC('ServiceDiscovery', 'findServices',
                    [serviceType, options, filter]);

            var timer = setTimeout(function () {
                rpcHandler.unregisterCallbackObject(rpc);
                // If no results return TimeoutError.
                if (!findOp.found && typeof callback.onError === 'function') {
                    callback.onError(new DOMError('TimeoutError', ''));
                }
            }, options && typeof options.timeout !== 'undefined' ?
                        options.timeout : 120000 // default timeout 120 secs
            );

            findOp = new PendingOperation(function() {
                // remove waiting requests from callerCache
                var index = callerCache.indexOf(rpc);
                if (index >= 0) {
                    callerCache.splice(index, 1);
                }
                rpcHandler.unregisterCallbackObject(rpc);
                if (typeof callback.onError === 'function') {
                    callback.onError(new DOMError('AbortError', ''));
                    clearTimeout(timer);
                    timer = null;
                }
            }, timer);

            var success = function (params) {
                var baseServiceObj = params;

                // reduce feature uri to base form, e.g. http://webinos.org/api/sensors
                // instead of http://webinos.org/api/sensors/light etc.
                var stype = /.+(?:api|ns|manager|mwc|core)\/(?:w3c\/|api-perms\/|internal\/|discovery\/)?[^\/\.]+/.exec(baseServiceObj.api);
                stype = stype ? stype[0] : undefined;

                var ServiceConstructor = typeMap[stype] || typeMapCompatible[stype];
                if (ServiceConstructor) {
                    // elevate baseServiceObj to usable local WebinosService object
                    var service = new ServiceConstructor(baseServiceObj, rpcHandler);
                    findOp.found = true;
                    callback.onFound(service);
                } else {
                    var serviceErrorMsg = 'Cannot instantiate webinos service: ' + stype;
                    if (typeof callback.onError === 'function') {
                        callback.onError(new DOMError("onServiceAvailable", serviceErrorMsg));
                    }
                }
            }; // End of function success

            // The core of findService.
            rpc.onservicefound = function (params) {
                // params is the parameters needed by the API method.
                success(params);
            };

            // denied by policy manager
            rpc.onSecurityError = function (params) {
                clearTimeout(timer);
                if (typeof callback.onError === 'function') {
                    callback.onError(new DOMError('SecurityError', ''));
                    clearTimeout(timer);
                }
            };

            rpc.onError = function (params) {
                var serviceErrorMsg = 'Cannot find webinos service.';
                if (typeof callback.onError === 'function') {
                    callback.onError(new DOMError('onError', serviceErrorMsg));
                    clearTimeout(timer);
                }
            };

            // Add this pending operation.
            rpcHandler.registerCallbackObject(rpc);

            if (typeof rpcHandler.parent !== 'undefined') {
                rpc.serviceAddress = rpcHandler.parent.config.pzhId;
            } else {
                rpc.serviceAddress = webinos.session.getServiceLocation();
            }

            if (!isOnNode() && !_webinosReady) {
                callerCache.push(rpc);
            } else {
                // Only do it when _webinosReady is true.
                rpcHandler.executeRPC(rpc);
            }

            return findOp;
        };  // End of findServices.

        if (isOnNode()) {
            return;
        }

        // further code only runs in the browser

        webinos.session.addListener('registeredBrowser', function () {
            _webinosReady = true;
            for (var i = 0; i < callerCache.length; i++) {
                var req = callerCache[i];
                rpcHandler.executeRPC(req);
            }
            callerCache = [];
        });
    };

    /**
     * Export definitions for node.js
     */
    if (isOnNode()) {
        exports.ServiceDiscovery = ServiceDiscovery;
    } else {
        // this adds ServiceDiscovery to the window object in the browser
        exports.ServiceDiscovery = ServiceDiscovery;
    }

    /**
     * Interface PendingOperation
     */
    function PendingOperation(cancelFunc, timer) {
        this.found = false;

        this.cancel = function () {
            clearTimeout(timer);
            cancelFunc();
        };
    }

    function DOMError(name, message) {
        return {
            name: name,
            message: message
        };
    }

    webinos.discovery = new ServiceDiscovery (webinos.rpcHandler);
    webinos.ServiceDiscovery = webinos.discovery; // for backward compat
}());
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 ******************************************************************************/

(function () {

    /**
     * Interface ConfigurationInterface
     */
    var ServiceConfiguration = function (rpcHandler) {

        /**
         * Get current configuration for a specified API.
         * @param apiName Name of source API.
         * @param successCB Callback to call with results.
         * @param errorCB Callback to call in case of error.
         */
        this.getAPIServicesConfiguration = function(apiName, successCB, errorCB) {
            //Calls to this method can be constrained using dashboard's feature
            var rpc = rpcHandler.createRPC('ServiceConfiguration', 'getAPIServicesConfiguration', [{'api':'http://webinos.org/api/dashboard'}, apiName]);
            rpcHandler.executeRPC(rpc
                    , function (params) { successCB(params); }
                    , function (params) { errorCB(params); }
            );
        };
 
        /**
         * Get current configuration for a specified API.
         * @param apiName Name of source API.
         * @param successCB Callback to call with results.
         * @param errorCB Callback to call in case of error.
         */
        this.getServiceConfiguration = function(apiName, successCB, errorCB) {
            //Calls to this method can be constrained using dashboard's feature
            var rpc = rpcHandler.createRPC('ServiceConfiguration', 'getServiceConfiguration', [{'api':'http://webinos.org/api/dashboard'}, apiName]);
            rpcHandler.executeRPC(rpc
                    , function (params) { successCB(params); }
                    , function (params) { errorCB(params); }
            );
        };
      
        /**
         * Set configuration to a specified API.
         * @param apiURI URI of target API.
         * @param config Configuration to apply. It updates the params field in the config.json file
         * @param successCB Callback to call with results.
         * @param errorCB Callback to call in case of error.
         */
        this.setAPIServicesConfiguration = function(apiURI, config, successCB, errorCB) {
            //Calls to this method can be constrained using dashboard's feature
            var rpc = rpcHandler.createRPC('ServiceConfiguration', 'setAPIServicesConfiguration', [{'api':'http://webinos.org/api/dashboard'}, apiURI, config]);
            rpcHandler.executeRPC(rpc
                    , function (params) { successCB(params); }
                    , function (params) { errorCB(params); }
            );
        };

        /**
         * Set configuration to a specified API.
         * @param serviceID ID of target service.
         * @param apiURI URI of service's type API.
         * @param config Configuration to apply. It updates the params field in the config.json file
         * @param successCB Callback to call with results.
         * @param errorCB Callback to call in case of error.
         */
        this.setServiceConfiguration = function(serviceID, apiURI, config, successCB, errorCB) {
            //Calls to this method can be constrained using dashboard's feature
            var rpc = rpcHandler.createRPC('ServiceConfiguration', 'setServiceConfiguration', [{'api':'http://webinos.org/api/dashboard'}, serviceID, apiURI, config]);
            rpcHandler.executeRPC(rpc
                    , function (params) { successCB(params); }
                    , function (params) { errorCB(params); }
            );
        };
    };

    /**
     * Export definitions for node.js
     */
    if (isOnNode()) {
        exports.ServiceConfiguration = ServiceConfiguration;
    } else {
        // this adds ServiceDiscovery to the window object in the browser
        exports.ServiceConfiguration = ServiceConfiguration;
    }
    
    webinos.configuration = new ServiceConfiguration (webinos.rpcHandler);
}());
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2013 Toby Ealden
******************************************************************************/
(function() {

	/**
	 * Webinos Get42 service constructor (client side).
	 * @constructor
	 * @param obj Object containing displayName, api, etc.
	 */
	ZoneNotificationsModule = function(obj) {
		exports.WebinosService.call(this, obj);
		
		this._testAttr = "HelloWorld";
		this.__defineGetter__("testAttr", function (){
			return this._testAttr + " Success";
		});
	};
	// Inherit all functions from WebinosService
	ZoneNotificationsModule.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	ZoneNotificationsModule.prototype.constructor = ZoneNotificationsModule;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/zonenotifications", ZoneNotificationsModule);
	
	/**
	 * To bind the service.
	 * @param bindCB BindCallback object.
	 */
	ZoneNotificationsModule.prototype.bindService = function (bindCB, serviceId) {
		// actually there should be an auth check here or whatever, but we just always bind
		this.getNotifications = getNotifications;
    this.getNotification = getNotification;
    this.addNotification = addNotification;
    this.deleteNotification = deleteNotification;
    this.notificationResponse = notificationResponse;
		this.listenAttr = {};
		this.listenerFor42 = listenerFor42.bind(this);
		
		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
	}
	
	/**
	 * Get 42.
	 * An example function which does a remote procedure call to retrieve a number.
	 * @param attr Some attribute.
	 * @param successCB Success callback.
	 * @param errorCB Error callback. 
	 */
	function getNotifications(attr, successCB, errorCB) {
		var rpc = webinos.rpcHandler.createRPC(this, "getNotifications", [attr]);
		webinos.rpcHandler.executeRPC(rpc,
				function (params){
					successCB(params);
				},
				function (error){
					errorCB(error);
				}
		);
	}

  function notificationResponse(responseTo, response, successCB, errorCB) {
    var rpc = webinos.rpcHandler.createRPC(this, "notificationResponse", [responseTo, response]);
    webinos.rpcHandler.executeRPC(rpc,
      function (params){
        successCB(params);
      },
      function (error){
        errorCB(error);
      }
    );
  }

  function getNotification(id, successCB, errorCB) {
    var rpc = webinos.rpcHandler.createRPC(this, "getNotification", [id]);
    webinos.rpcHandler.executeRPC(rpc,
      function (params){
        successCB(params);
      },
      function (error){
        errorCB(error);
      }
    );
  }

  function addNotification(type,data,successCB,errorCB) {
    var rpc = webinos.rpcHandler.createRPC(this, "addNotification", [type, data]);
    webinos.rpcHandler.executeRPC(rpc,
      function (params){
        if (typeof successCB === "function") {
          successCB(params);
        }
      },
      function (error){
        if (typeof errorCB === "function") {
          errorCB(error);
        }
      }
    );
  }

  function deleteNotification(id,successCB,errorCB) {
    var rpc = webinos.rpcHandler.createRPC(this, "deleteNotification", [id]);
    webinos.rpcHandler.executeRPC(rpc,
      function (params){
        if (typeof successCB === "function") {
          successCB(params);
        }
      },
      function (error){
        if (typeof errorCB === "function") {
          errorCB(error);
        }
      }
    );
  }

	/**
	 * Listen for 42.
	 * An exmaple function to register a listener which is then called more than
	 * once via RPC from the server side.
	 * @param listener Listener function that gets called.
	 * @param options Optional options.
	 */
	function listenerFor42(listener, options) {
		var rpc = webinos.rpcHandler.createRPC(this, "listenAttr.listenFor42", [options]);

		// add one listener, could add more later
		rpc.onEvent = function(obj) {
			// we were called back, now invoke the given listener
			listener(obj);
			webinos.rpcHandler.unregisterCallbackObject(rpc);
		};

		webinos.rpcHandler.registerCallbackObject(rpc);
		webinos.rpcHandler.executeRPC(rpc);
	}
	
}());(function() {

WebinosDeviceOrientation = function (obj) {
  exports.WebinosService.call(this, obj);
};

	// Inherit all functions from WebinosService
	WebinosDeviceOrientation.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	WebinosDeviceOrientation.prototype.constructor = WebinosDeviceOrientation;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/deviceorientation", WebinosDeviceOrientation);

var _referenceMappingDo = new Array();
var _eventIdsDo = new Array('deviceorientation', 'compassneedscalibration', 'devicemotion');

WebinosDeviceOrientation.prototype.bindService = function (bindCB, serviceId) {
	// actually there should be an auth check here or whatever, but we just always bind
	this.addEventListener = addEventListener;
	this.removeEventListener = removeEventListener;
	this.dispatchEvent = dispatchEvent;
	
    //Objects
    this.DeviceOrientationEvent = DeviceOrientationEvent;
    this.DeviceMotionEvent = DeviceMotionEvent;
    this.Acceleration = Acceleration;
    this.RotationRate = RotationRate;
    
    
    
    
	if (typeof bindCB.onBind === 'function') {
		bindCB.onBind(this);
	};
}

function addEventListener(type, listener, useCapture) {
    
    if(_eventIdsDo.indexOf(type) != -1){	
    
            console.log("LISTENER"+ listener);
    
			var rpc = webinos.rpcHandler.createRPC(this, "addEventListener", [type, listener, useCapture]);
			_referenceMappingDo.push([rpc.id, listener]);

			console.log('# of references' + _referenceMappingDo.length);	
			rpc.onEvent = function (orientationEvent) {
				listener(orientationEvent);
			};
            
			webinos.rpcHandler.registerCallbackObject(rpc);
			webinos.rpcHandler.executeRPC(rpc);
		}else{
			console.log(type + ' not found');	
		}
};

//DEFINITION BASE EVENT
WDomEvent = function(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp){
	this.initEvent(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp);
}

WDomEvent.prototype.speed = 0;

WDomEvent.prototype.initEvent = function(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp){
    this.type = type;
    this.target = target;
    this.currentTarget = currentTarget;
    this.eventPhase = eventPhase;
    this.bubbles = bubbles;
    this.cancelable  = cancelable;
    this.timestamp = timestamp; 
}


DeviceOrientationEvent = function(alpha, beta, gamma){
	this.initDeviceOrientationEvent(alpha, beta, gamma);
}

DeviceOrientationEvent.prototype = new WDomEvent();
DeviceOrientationEvent.prototype.constructor = DeviceOrientationEvent;
DeviceOrientationEvent.parent = WDomEvent.prototype; // our "super" property

DeviceOrientationEvent.prototype.initDeviceOrientationEvent = function(alpha, beta, gamma){
	this.alpha = alpha;
	this.beta = beta;
	this.gamma = gamma;
    
    var d = new Date();
    var stamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    var stamp = stamp + d.getUTCMilliseconds();
    
	DeviceOrientationEvent.parent.initEvent.call(this,'deviceorientation', null, null, null, false, false, stamp);
}
Acceleration = function(x,y,z){
	this.x = x;
	this.y = y;
	this.z = z;
}
RotationRate = function(alpha, beta, gamma){
	this.alpha = alpha;
	this.beta = beta;
	this.gamma = gamma;
}
DeviceMotionEvent = function(acceleration, accelerationIncludingGravity, rotationRate, interval){
	this.initDeviceMotionEvent(acceleration, accelerationIncludingGravity, rotationRate, interval);
}
DeviceMotionEvent.prototype = new WDomEvent();
DeviceMotionEvent.prototype.constructor = DeviceOrientationEvent;
DeviceMotionEvent.parent = WDomEvent.prototype; // our "super" property

DeviceMotionEvent.prototype.initDeviceMotionEvent = function(acceleration, accelerationIncludingGravity, rotationRate, interval){
	this.acceleration = acceleration;
	this.accelerationIncludingGravity = accelerationIncludingGravity;
	this.rotationRate = rotationRate;
	this.interval = interval;
    var d = new Date();
    var stamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    var stamp = stamp + d.getUTCMilliseconds();
	DeviceOrientationEvent.parent.initEvent.call(this,'devicemotion', null, null, null, false, false, stamp);
}

function removeEventListener(type, listener, useCapture) {
        console.log("LISTENER"+ listener);
        var refToBeDeleted = null;
		for(var i = 0; i < _referenceMappingDo.length; i++){
			console.log("Reference" + i + ": " + _referenceMappingDo[i][0]);
			console.log("Handler" + i + ": " + _referenceMappingDo[i][1]);
			if(_referenceMappingDo[i][1] == listener){
					var arguments = new Array();
					arguments[0] = _referenceMappingDo[i][0];
					arguments[1] = type;
					console.log("ListenerObject to be removed ref#" + _referenceMappingDo[i][0]);                                             
                    var rpc = webinos.rpcHandler.createRPC(this, "removeEventListener", arguments);
					webinos.rpcHandler.executeRPC(rpc,
						function(result){
							callOnSuccess(result);
						},
						function(error){
							callOnError(error);
						}
					);
					break;			
			}	
    }
};

function dispatchEvent(event) {
    //TODO
};

})();(function () {
	var PropertyValueSuccessCallback, ErrorCallback, DeviceAPIError, PropertyRef;

	DeviceStatusManager = function (obj) {
    exports.WebinosService.call(this, obj);
	};
	
	DeviceStatusManager.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	DeviceStatusManager.prototype.constructor = DeviceStatusManager;
	// Register in the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/devicestatus", DeviceStatusManager);

	DeviceStatusManager.prototype.bindService = function (bindCB, serviceId) {
		// actually there should be an auth check here or whatever, but we just always bind
		this.getComponents = getComponents;
		this.isSupported = isSupported;
		this.getPropertyValue = getPropertyValue;

		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
	}

	function getComponents (aspect, successCallback, errorCallback)	{
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.getComponents", [aspect]);
		webinos.rpcHandler.executeRPC(rpc,
			function (params) { successCallback(params); }
		);
		return;
	}

	function isSupported (aspect, property, successCallback)
	{
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.isSupported", [aspect, property]);
		webinos.rpcHandler.executeRPC(
			rpc, 
			function (res) { successCallback(res); }
		);
		return;
	}

	function getPropertyValue (successCallback, errorCallback, prop) {
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.getPropertyValue", [prop]);
		webinos.rpcHandler.executeRPC(
			rpc, 
			function (params) { successCallback(params); },
			function (err) { errorCallback(err); }
		);
		return;
	};

	PropertyValueSuccessCallback = function () {};

	PropertyValueSuccessCallback.prototype.onSuccess = function (prop) {
		return;
	};

	ErrorCallback = function () {};

	ErrorCallback.prototype.onError = function (error) {
		return;
	};

	DeviceAPIError = function () {
		this.message = String;
		this.code = Number;
	};

	DeviceAPIError.prototype.UNKNOWN_ERR                    = 0;
	DeviceAPIError.prototype.INDEX_SIZE_ERR                 = 1;
	DeviceAPIError.prototype.DOMSTRING_SIZE_ERR             = 2;
	DeviceAPIError.prototype.HIERARCHY_REQUEST_ERR          = 3;
	DeviceAPIError.prototype.WRONG_DOCUMENT_ERR             = 4;
	DeviceAPIError.prototype.INVALID_CHARACTER_ERR          = 5;
	DeviceAPIError.prototype.NO_DATA_ALLOWED_ERR            = 6;
	DeviceAPIError.prototype.NO_MODIFICATION_ALLOWED_ERR    = 7;
	DeviceAPIError.prototype.NOT_FOUND_ERR                  = 8;
	DeviceAPIError.prototype.NOT_SUPPORTED_ERR              = 9;
	DeviceAPIError.prototype.INUSE_ATTRIBUTE_ERR            = 10;
	DeviceAPIError.prototype.INVALID_STATE_ERR              = 11;
	DeviceAPIError.prototype.SYNTAX_ERR                     = 12;
	DeviceAPIError.prototype.INVALID_MODIFICATION_ERR       = 13;
	DeviceAPIError.prototype.NAMESPACE_ERR                  = 14;
	DeviceAPIError.prototype.INVALID_ACCESS_ERR             = 15;
	DeviceAPIError.prototype.VALIDATION_ERR                 = 16;
	DeviceAPIError.prototype.TYPE_MISMATCH_ERR              = 17;
	DeviceAPIError.prototype.SECURITY_ERR                   = 18;
	DeviceAPIError.prototype.NETWORK_ERR                    = 19;
	DeviceAPIError.prototype.ABORT_ERR                      = 20;
	DeviceAPIError.prototype.TIMEOUT_ERR                    = 21;
	DeviceAPIError.prototype.INVALID_VALUES_ERR             = 22;
	DeviceAPIError.prototype.NOT_AVAILABLE_ERR              = 101;
	DeviceAPIError.prototype.code = Number;
	DeviceAPIError.prototype.message = Number;

	PropertyRef = function () {
		this.component = String;
		this.aspect = String;
		this.property = String;
	};

	PropertyRef.prototype.component = String;
	PropertyRef.prototype.aspect = String;
	PropertyRef.prototype.property = String;

}());
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2012 Ziran Sun Samsung Electronics(UK) Ltd
*
******************************************************************************/
(function () {

	/**
	 * Webinos Bluetooth Discovery service constructor (client side).
	 * @constructor
	 * @param obj Object containing displayName, api, etc.
	 */
	DiscoveryModule = function (obj) {
    exports.WebinosService.call(this, obj);
	};
	
    // Inherit all functions from WebinosService
	DiscoveryModule.prototype = Object.create(exports.WebinosService.prototype);
    // The following allows the 'instanceof' to work properly
	DiscoveryModule.prototype.constructor = DiscoveryModule;
    // Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/discovery", DiscoveryModule);
	
	/**
	 * To find devices that support the specific service. This applies to both Android and Linux
	 * @param data Service type.
	 * @param success Success callback.
	 */
	DiscoveryModule.prototype.BTfindservice = function (data, success) {
		console.log("BT findservice");
		var rpc = webinos.rpcHandler.createRPC(this, "BTfindservice", arguments);
		webinos.rpcHandler.executeRPC(rpc, function(params) {
			success(params);
		});
	};
	
	
	/**
	 * To find devices using DNS . This applies to Android
	 * @param data Service type.
	 * @param success Success callback.
	 */
	DiscoveryModule.prototype.DNSfindservice = function(data, success){
		console.log("DNS findservice");
		var rpc = webinos.rpcHandler.createRPC(this, "DNSfindservice", arguments);
		webinos.rpcHandler.executeRPC(rpc, function(params) {
			success(params);
		});
	};
	
	/**
	 * To find Heart Rate Monitor device, only support Android OS.
	 * @param data Service type.
	 * @param success Success callback.
	 */

	DiscoveryModule.prototype.findHRM = function(data, success){
		console.log("HRM find HRM");
  		var rpc = webinos.rpcHandler.createRPC(this, "findHRM",data);
	  	webinos.rpcHandler.executeRPC(rpc, function(params) {
	  		success(params);
	  	});
	};

}());
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2012 André Paul, Fraunhofer FOKUS
******************************************************************************/
(function() {

	// Mapping of local listenerId to remote listenerId
	var registeredListeners = {};

	// Mapping of listenerId to RPC callback obj
	var registeredRPCCallbacks = {};

	var eventService = null;

	/**
	 * Webinos Event service constructor (client side).
	 * @constructor
	 * @param obj Object containing displayName, api, etc.
	 */
	EventsModule = function(obj) {
    exports.WebinosService.call(this, obj);
		eventService = this;
		this.idCount = 0;
		//this.myAppID = "TestApp" + webinos.messageHandler.getOwnSessionId();

		//TODO, this is the actuall messaging/session app id but should be replaced with the Apps unique ID (config.xml)
		this.myAppID = webinos.messageHandler.getOwnSessionId();
		console.log("MyAppID: " + this.myAppID);
	};

	// Inherit all functions from WebinosService
	EventsModule.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	EventsModule.prototype.constructor = EventsModule;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/events", EventsModule);

	/**
	 * To bind the service.
	 * @param bindCB BindCallback object.
	 */
	EventsModule.prototype.bind = function(bindCB) {

		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
		
	};

	/**
	 * Creates a webinos Event.
	 * @param type Event type identifier.
	 * @param addressing References to the sending entity on the behalf of which the application wants to create the event and to the event recipients.
	 * @param payload Event type-specific data or null (undefined is considered as equivalent to null).
	 * @param inResponseTo Event that this event is a response to (undefined is considered as equivalent to null).
	 * @param withTimeStamp Whether to set the generation timestamp (undefined is considered as equivalent to false).
	 * @param expiryTimeStamp Moment in time past which the event is no more valid or meaningful (undefined is considered as equivalent to null).
	 * @param addressingSensitive Whether the addressing information is part of the informative content of the event (undefined is considered as equivalent to false).
	 */
	EventsModule.prototype.createWebinosEvent = function (type, addressing, payload, inResponseTo, withTimeStamp, expiryTimeStamp, addressingSensitive){

		var anEvent = new WebinosEvent();
		anEvent.type = type;
		anEvent.addressing = addressing;
		anEvent.payload = payload;
		anEvent.inResponseTo = inResponseTo;
		anEvent.timeStamp = new Date().getTime();
		anEvent.expiryTimeStamp = expiryTimeStamp;
		anEvent.addressingSensitive = addressingSensitive;


		//  raises(WebinosEventException);
		//	returns WebinosEvent
		return anEvent;
	};

	/**
	 * Registers an event listener.
	 * @param listener The event listener.
	 * @param type Specific event type or null for any type (undefined is considered as null).
	 * @param source Specific event source or null for any source (undefined is considered as null).
	 * @param destination Specific event recipient (whether primary or not) or null for any destination (undefined is considered as null).
	 * @returns Listener identifier.
	 */
	EventsModule.prototype.addWebinosEventListener = function(listener, type, source, destination) {

		if (this.idCount === Number.MAX_VALUE) this.idCount = 0;
		this.idCount++;

		var listenerId = this.myAppID + ":" + this.idCount;

		var reqParams = {
			type: type,
			source: source,
			destination: destination
		};
		if (!source) reqParams.source = this.myAppID;

		var rpc = webinos.rpcHandler.createRPC(this, "addWebinosEventListener",  reqParams);

		rpc.handleEvent = function(params, scb, ecb) {
			console.log("Received a new WebinosEvent");
			listener(params.webinosevent);
			scb();
		};

		webinos.rpcHandler.registerCallbackObject(rpc);

		// store RPC callback obj to unregister it when removing event listener
		registeredRPCCallbacks[listenerId] = rpc;

		webinos.rpcHandler.executeRPC(rpc,
			function(remoteId) {
				console.log("New WebinosEvent listener registered. Mapping remote ID", remoteId, " localID ", listenerId);

				registeredListeners[listenerId] = remoteId;
			},
			function(error) {
				console.log("Error while registering new WebinosEvent listener");
			}
		);

		// raises(WebinosEventException);
		return listenerId;
	};

	/**
     * Unregisters an event listener.
     * @param listenerId Listener identifier as returned by addWebinosEventListener().
     */
	EventsModule.prototype.removeWebinosEventListener = function(listenerId) {

		if (!listenerId || typeof listenerId !== "string") {
			throw new WebinosEventException(WebinosEventException.INVALID_ARGUMENT_ERROR, "listenerId must be string type");
		}

		var rpc = webinos.rpcHandler.createRPC(this, "removeWebinosEventListener",  registeredListeners[listenerId]);
		webinos.rpcHandler.executeRPC(rpc);

		// unregister RPC callback obj
		webinos.rpcHandler.unregisterCallbackObject(registeredRPCCallbacks[listenerId]);
		registeredRPCCallbacks[listenerId] = undefined;
		registeredListeners[listenerId] = undefined;

		// returns void
	};

	/**
	 * Webinos event exception constructor.
	 * @constructor
	 * @param code Error code.
	 * @param message Descriptive error message.
	 */
	WebinosEventException = function(code, message) {
		this.code = code;
		this.message = message;
	};
	// constants
	WebinosEventException.__defineGetter__("INVALID_ARGUMENT_ERROR",  function() {return 1});
	WebinosEventException.__defineGetter__("PERMISSION_DENIED_ERROR", function() {return 2});

	/**
	 * Webinos Event constructor.
	 * @constructor
	 */
	WebinosEvent = function() {
		this.id =  Math.floor(Math.random()*1001);  //DOMString
		this.type = null;					//DOMString
		this.addressing = {};  			//WebinosEventAddressing
		this.addressing.source = eventService.myAppID;
		this.inResponseTo = null;			//WebinosEvent
		this.timeStamp = null;				//DOMTimeStamp
		this.expiryTimeStamp = null;		//DOMTimeStamp
		this.addressingSensitive = null;	//bool
		this.forwarding = null;			//WebinosEventAddressing
		this.forwardingTimeStamp = null;	//DOMTimeStamp
		this.payload = null;				//DOMString
	};

	/**
	 * Sends an event.
	 * @param callbacks Set of callbacks to monitor sending status (null and undefined are considered as equivalent to a WebinosEventCallbacks object with all attributes set to null).
	 * @param referenceTimeout Moment in time until which the Webinos runtime SHALL ensure that the WebinosEvent object being sent is not garbage collected for the purpose of receiving events in response to the event being sent (null, undefined and values up to the current date/time mean that no special action is taken by the runtime in this regard).
	 * @param sync If false or undefined, the function is non-blocking, otherwise if true it will block.
	 */
	WebinosEvent.prototype.dispatchWebinosEvent = function(callbacks, referenceTimeout, sync) {

		var params = {
			webinosevent: {
				id: this.id,
				type: this.type,
				addressing: this.addressing,
				inResponseTo: this.inResponseTo,
				timeStamp: this.timeStamp,
				expiryTimeStamp: this.expiryTimeStamp,
				addressingSensitive: this.addressingSensitive,
				forwarding: this.forwarding,
				forwardingTimeStamp: this.forwardingTimeStamp,
				payload: this.payload
			},
			referenceTimeout: referenceTimeout,
			sync: sync
		};

		if (!params.webinosevent.addressing) {
			params.webinosevent.addressing = {};
		}
		params.webinosevent.addressing.source = {};
		params.webinosevent.addressing.source.id = eventService.myAppID;

		// check that callbacks has the right type
		if (callbacks) {
			if (typeof callbacks !== "object") {
				throw new WebinosEventException(WebinosEventException.INVALID_ARGUMENT_ERROR, "callbacks must be of type WebinosEventCallbacks");
			}
			var cbNames = ["onSending", "onCaching", "onDelivery", "onTimeout", "onError"];
			for (var cbName in cbNames) {
				var cb = callbacks[cbName];
				if (cb && typeof cb !== "function") {
					throw new WebinosEventException(WebinosEventException.INVALID_ARGUMENT_ERROR, "cb is not a function");
				}
			}
			params.withCallbacks = true;
		}

		var rpc = webinos.rpcHandler.createRPC(eventService, "WebinosEvent.dispatchWebinosEvent", params);

		if (callbacks) {

			console.log("Registering delivery callback");

			rpc.onSending = function (params) {
				// params.event, params.recipient
				if (callbacks.onSending) {
					callbacks.onSending(params.event, params.recipient);
				}
			};
			rpc.onCaching = function (params) {
				// params.event
				if (callbacks.onCaching) {
					callbacks.onCaching(params.event);
				}
			};
			rpc.onDelivery = function (params) {
				// params.event, params.recipient
				if (callbacks.onDelivery) {
					callbacks.onDelivery(params.event, params.recipient);
				}
				webinos.rpcHandler.unregisterCallbackObject(rpc);
			};
			rpc.onTimeout = function (params) {
				// params.event, params.recipient
				if (callbacks.onTimeout) {
					callbacks.onTimeout(params.event, params.recipient);
				}
				webinos.rpcHandler.unregisterCallbackObject(rpc);
			};
			rpc.onError = function (params) {
				// params.event, params.recipient, params.error
				if (callbacks.onError) {
					callbacks.onError(params.event, params.recipient, params.error);
				}
				webinos.rpcHandler.unregisterCallbackObject(rpc);
			};

			webinos.rpcHandler.registerCallbackObject(rpc);
		}

		webinos.rpcHandler.executeRPC(rpc);

		//raises(WebinosEventException);
		//returns void
    };

	/**
	 * Forwards an event.
	 * [not yet implemented]
	 */
	WebinosEvent.prototype.forwardWebinosEvent = function(forwarding, withTimeStamp, callbacks, referenceTimeout, sync){

    	//returns void
    	//raises(WebinosEventException);
    };

}());/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.util === "undefined") webinos.util = {};

(function (exports) {
  exports.inherits = inherits;

  // webinos <3 inherits
  function inherits(c, p, proto) {
    proto = proto || {};
    var e = {};
    [c.prototype, proto].forEach(function (s) {
      Object.getOwnPropertyNames(s).forEach(function (k) {
        e[k] = Object.getOwnPropertyDescriptor(s, k);
      });
    });
    c.prototype = Object.create(p.prototype, e);
    c.super_ = p;
  }

  exports.CustomError = CustomError;

  inherits(CustomError, Error);
  function CustomError(name, message) {
    Error.call(this, message || name);

    this.name = name;
  }

  exports.EventTarget = EventTarget;

  function EventTarget() {}

  EventTarget.prototype.addEventListener = function (type, listener) {
    if (typeof this.events === "undefined") this.events = {};
    if (typeof this.events[type] === "undefined") this.events[type] = [];

    this.events[type].push(listener);
  };

  EventTarget.prototype.removeEventListener = function (type, listener) {
    if (typeof this.events === "undefined" ||
        typeof this.events[type] === "undefined") {
      return;
    }

    var position = this.events[type].indexOf(listener);
    if (position >= 0) {
      this.events[type].splice(position, 1);
    }
  };

  EventTarget.prototype.removeAllListeners = function (type) {
    if (arguments.length === 0) {
      this.events = {};
    } else if (typeof this.events !== "undefined" &&
               typeof this.events[type] !== "undefined") {
      this.events[type] = [];
    }
  };

  EventTarget.prototype.dispatchEvent = function (event) {
    if (typeof this.events === "undefined" ||
        typeof this.events[event.type] === "undefined") {
      return false;
    }

    var listeners = this.events[event.type].slice();
    if (!listeners.length) return false;

    for (var i = 0, length = listeners.length; i < length; i++) {
      listeners[i].call(this, event);
    }

    return true;
  };

  exports.Event = Event;

  function Event(type) {
    this.type = type;
    this.timeStamp = Date.now();
  }

  exports.ProgressEvent = ProgressEvent;

  inherits(ProgressEvent, Event);
  function ProgressEvent(type, eventInitDict) {
    Event.call(this, type);

    eventInitDict = eventInitDict || {};

    this.lengthComputable = eventInitDict.lengthComputable || false;
    this.loaded = eventInitDict.loaded || 0;
    this.total = eventInitDict.total || 0;
  }

  exports.callback = function (maybeCallback) {
    if (typeof maybeCallback !== "function") {
      return function () {};
    }
    return maybeCallback;
  };

  exports.async = function (callback) {
    if (typeof callback !== "function") {
      return callback;
    }
    return function () {
      var argsArray = arguments;
      setTimeout(function () {
        callback.apply(null, argsArray);
      }, 0);
    };
  };

  exports.ab2hex = function (buf) {
    var hex = "";
    var view = new Uint8Array(buf);
    for (var i = 0; i < view.length; i++) {
      var repr = view[i].toString(16);
      hex += (repr.length < 2 ? "0" : "") + repr;
    }
    return hex;
  };

  exports.hex2ab = function (hex) {
    var buf = new ArrayBuffer(hex.length / 2);
    var view = new Uint8Array(buf);
    for (var i = 0; i < view.length; i++) {
      view[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return buf;
  }
})(webinos.util);
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.path === "undefined") webinos.path = {};

// webinos <3 node.js
(function (exports) {
  var splitPathRe = /^(\/?)([\s\S]+\/(?!$)|\/)?((?:\.{1,2}$|[\s\S]+?)?(\.[^.\/]*)?)$/;

  function splitPath(path) {
    var result = splitPathRe.exec(path);
    return [result[1] || "", result[2] || "", result[3] || "", result[4] || ""];
  }

  function normalizeArray(parts, allowAboveRoot) {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var part = parts[i];
      if (part === ".") {
        parts.splice(i, 1);
      } else if (part === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }

    if (allowAboveRoot) {
      for (; up--;) {
        parts.unshift("..");
      }
    }

    return parts;
  }

  exports.normalize = function (path) {
    var isAbsolute = path.charAt(0) === "/"
      , trailingSlash = path.substr(-1) === "/";

    path = normalizeArray(path.split("/").filter(function (part) {
      return !!part;
    }), !isAbsolute).join("/");

    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }

    return (isAbsolute ? "/" : "") + path;
  };

  exports.join = function () {
    var paths = Array.prototype.slice.call(arguments, 0);
    return exports.normalize(paths.filter(function (path) {
      return path && typeof path === "string";
    }).join("/"));
  };

  exports.resolve = function () {
    var resolvedPath = ""
      , resolvedAbsolute = false;

    for (var i = arguments.length - 1; i >= 0 && !resolvedAbsolute; i--) {
      // TODO Use some fallback (e.g., the current working directory ..not)?
      var path = arguments[i];

      if (!path || typeof path !== "string") {
        continue;
      }

      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = path.charAt(0) === "/";
    }

    resolvedPath = normalizeArray(
      resolvedPath.split("/").filter(function (part) {
        return !!part;
      }
    ), !resolvedAbsolute).join("/");

    return ((resolvedAbsolute ? "/" : "") + resolvedPath) || ".";
  };

  exports.relative = function (from, to) {
    from = exports.resolve(from).substr(1);
    to = exports.resolve(to).substr(1);

    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== "") break;
      }

      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== "") break;
      }

      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }

    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));

    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }

    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join("/");
  };

  // webinos <3 webkit
  exports.isParentOf = function (parent, mayBeChild) {
    if (parent === "/" && mayBeChild !== "/") {
      return true;
    }

    if (parent.length > mayBeChild.length || mayBeChild.indexOf(parent) !== 0) {
      return false;
    }

    if (mayBeChild.charAt(parent.length) !== "/") {
      return false;
    }

    return true;
  };

  exports.dirname = function (path) {
    var result = splitPath(path)
      , root = result[0]
      , dir = result[1];

    if (!root && !dir) {
      return ".";
    }

    if (dir) {
      dir = dir.substr(0, dir.length - 1);
    }

    return root + dir;
  };

  exports.basename = function (path, ext) {
    var file = splitPath(path)[2];

    if (ext && file.substr(-1 * ext.length) === ext) {
      file = file.substr(0, file.length - ext.length);
    }

    return file;
  };

  exports.extname = function (path) {
    return splitPath(path)[3];
  };
})(webinos.path);
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

// [WP-608] Support write/truncate abort

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.file === "undefined") webinos.file = {};

(function (exports) {
  exports.Service = Service;
  // This inherits is specified in file API so please don't use it in your own APIs
  webinos.util.inherits(Service, globalExports.WebinosService);
  function Service(object, rpc) {
    globalExports.WebinosService.call(this, object);

    this.rpc = rpc;
  }
  // Register to the service discovery
  _webinos.registerServiceConstructor("http://webinos.org/api/file", Service);  

  Service.prototype.requestFileSystem = function (type, size, successCallback, errorCallback) {
    var self = this;
    var requestFileSystem = self.rpc.createRPC(self, "requestFileSystem");
    self.rpc.executeRPC(requestFileSystem, function (filesystem) {
      successCallback(new FileSystem(self, filesystem.name));
    }, errorCallback);
  };

  Service.prototype.resolveLocalFileSystemURL = function (url, successCallback, errorCallback) {
    webinos.util.async(errorCallback)(new webinos.util.CustomError("NotSupportedError"));
  };

  function FileSystem(service, name) {
    this.service = service;

    this.name = name;
    this.root = new DirectoryEntry(this, "/");
  }

  FileSystem.prototype.toJSON = function () {
    var json = { name : this.name };
    return json;
  };

  function Entry(filesystem, fullPath) {
    this.name = webinos.path.basename(fullPath);
    this.fullPath = fullPath;
    this.filesystem = filesystem;

    this.service = filesystem.service;
    this.rpc = filesystem.service.rpc;
  }

  Entry.prototype.isFile = false;
  Entry.prototype.isDirectory = false;

  Entry.prototype.getMetadata = function (successCallback, errorCallback) {
    var getMetadata = this.rpc.createRPC(this.service, "getMetadata", { entry : this });
    this.rpc.executeRPC(getMetadata, function (metadata) {
      successCallback(new Metadata(metadata));
    }, errorCallback);
  };

  Entry.prototype.moveTo = function (parent, newName, successCallback, errorCallback) {
    var self = this;
    if (self.service === parent.service) {
      var moveTo = self.rpc.createRPC(self.service, "moveTo", { source : self, parent : parent, newName : newName });
      self.rpc.executeRPC(moveTo, function (entry) {
        if (self.isDirectory) {
          successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
        } else {
          successCallback(new FileEntry(self.filesystem, entry.fullPath));
        }
      }, errorCallback);
    } else {
      var getLink = self.rpc.createRPC(self.service, "getLink", { entry : self });
      self.rpc.executeRPC(getLink, function (link) {
        var download = parent.rpc.createRPC(parent.service, "download", { link : link, parent : parent, name : newName || self.name });
        parent.rpc.executeRPC(download, function (entry) {
          var remove = self.rpc.createRPC(self.service, (self.isDirectory ? "removeRecursively" : "remove"), { entry : self });
          self.rpc.executeRPC(remove, function () {
            if (self.isDirectory) {
              successCallback(new DirectoryEntry(parent.filesystem, entry.fullPath));
            } else {
              successCallback(new FileEntry(parent.filesystem, entry.fullPath));
            }
          }, errorCallback);
        }, errorCallback);
      }, errorCallback);
    }
  };

  Entry.prototype.copyTo = function (parent, newName, successCallback, errorCallback) {
    var self = this;
    if (self.service === parent.service) {
      var copyTo = self.rpc.createRPC(self.service, "copyTo", { source : self, parent : parent, newName : newName });
      self.rpc.executeRPC(copyTo, function (entry) {
        if (self.isDirectory) {
          successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
        } else {
          successCallback(new FileEntry(self.filesystem, entry.fullPath));
        }
      }, errorCallback);
    } else {
      var getLink = self.rpc.createRPC(self.service, "getLink", { entry : self });
      self.rpc.executeRPC(getLink, function (link) {
        var download = parent.rpc.createRPC(parent.service, "download", { link : link, parent : parent, name : newName || self.name });
        parent.rpc.executeRPC(download, function (entry) {
          if (self.isDirectory) {
            successCallback(new DirectoryEntry(parent.filesystem, entry.fullPath));
          } else {
            successCallback(new FileEntry(parent.filesystem, entry.fullPath));
          }
        }, errorCallback);
      }, errorCallback);
    }
  };

  Entry.prototype.toURL = function () {
    throw new webinos.util.CustomError("NotSupportedError");
  };

  Entry.prototype.remove = function (successCallback, errorCallback) {
    var remove = this.rpc.createRPC(this.service, "remove", { entry : this });
    this.rpc.executeRPC(remove, successCallback, errorCallback);
  };

  Entry.prototype.getParent = function (successCallback, errorCallback) {
    var self = this;
    var getParent = self.rpc.createRPC(self.service, "getParent", { entry : self });
    self.rpc.executeRPC(getParent, function (entry) {
      successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  Entry.prototype.toJSON = function () {
    var json =
      { name        : this.name
      , fullPath    : this.fullPath
      , filesystem  : this.filesystem
      , isFile      : this.isFile
      , isDirectory : this.isDirectory
      };
    return json;
  };

  function Metadata(metadata) {
    this.modificationTime = new Date(metadata.modificationTime);
    this.size = metadata.size;
  }

  webinos.util.inherits(DirectoryEntry, Entry);
  function DirectoryEntry(filesystem, fullPath) {
    Entry.call(this, filesystem, fullPath);
  }

  DirectoryEntry.prototype.isDirectory = true;

  DirectoryEntry.prototype.createReader = function () {
    return new DirectoryReader(this);
  };

  DirectoryEntry.prototype.getFile = function (path, options, successCallback, errorCallback) {
    var self = this;
    var getFile = self.rpc.createRPC(self.service, "getFile", { entry : self, path : path, options : options });
    self.rpc.executeRPC(getFile, function (entry) {
      successCallback(new FileEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  DirectoryEntry.prototype.getDirectory = function (path, options, successCallback, errorCallback) {
    var self = this;
    var getDirectory = self.rpc.createRPC(self.service, "getDirectory", { entry : self, path : path, options : options });
    self.rpc.executeRPC(getDirectory, function (entry) {
      successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  DirectoryEntry.prototype.removeRecursively = function (successCallback, errorCallback) {
    var removeRecursively = this.rpc.createRPC(this.service, "removeRecursively", { entry : this });
    this.rpc.executeRPC(removeRecursively, successCallback, errorCallback);
  };

  function DirectoryReader(entry) {
    this.entry = entry;

    this.service = entry.filesystem.service;
    this.rpc = entry.filesystem.service.rpc;
  }

  DirectoryReader.prototype.readEntries = function (successCallback, errorCallback) {
    var self = this;

    function next() {
      if (!self.entries.length) return [];

      var chunk = self.entries.slice(0, 10);
      self.entries.splice(0, 10);
      return chunk;
    }

    if (typeof self.entries === "undefined") {
      var readEntries = self.rpc.createRPC(self.service, "readEntries", { entry : self.entry });
      self.rpc.executeRPC(readEntries, function (entries) {
        self.entries = entries.map(function (entry) {
          if (entry.isDirectory) {
            return new DirectoryEntry(self.entry.filesystem, entry.fullPath);
          } else {
            return new FileEntry(self.entry.filesystem, entry.fullPath);
          }
        });

        successCallback(next());
      }, errorCallback);
    } else webinos.util.async(successCallback)(next());
  };

  webinos.util.inherits(FileEntry, Entry);
  function FileEntry(filesystem, fullPath) {
    Entry.call(this, filesystem, fullPath);
  }

  FileEntry.prototype.isFile = true;

  FileEntry.prototype.getLink = function (successCallback, errorCallback) {
    var getLink = this.rpc.createRPC(this.service, "getLink", { entry : this });
    this.rpc.executeRPC(getLink, successCallback, errorCallback);
  };

  FileEntry.prototype.createWriter = function (successCallback, errorCallback) {
    var self = this;
    var getMetadata = self.rpc.createRPC(self.service, "getMetadata", { entry : self });
    self.rpc.executeRPC(getMetadata, function (metadata) {
      var writer = new FileWriter(self);
      writer.length = metadata.size;

      successCallback(writer);
    }, errorCallback);
  };

  FileEntry.prototype.file = function (successCallback, errorCallback) {
    var self = this;
    var getMetadata = self.rpc.createRPC(self.service, "getMetadata", { entry : self });
    self.rpc.executeRPC(getMetadata, function (metadata) {
      var blobParts = [];

      var remote;
      var port = self.rpc.createRPC(self.service, "read",
         { entry : self
         , options : { bufferSize : 16 * 1024, autopause : true }
         });
      port.ref = function (params, successCallback, errorCallback, ref) {
        remote = ref;
      };
      port.open = function () {};
      port.data = function (params) {
        blobParts.push(webinos.util.hex2ab(params.data));

        var resume = self.rpc.createRPC(remote, "resume", null);
        self.rpc.executeRPC(resume);
      };
      port.end = function () {};
      port.close = function () {
        try {
          var blob = new Blob(blobParts);
          blob.name = self.name;
          blob.lastModifiedDate = new Date(metadata.modificationTime);

          successCallback(blob);
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      };
      port.error = function (params) {
        try {
          errorCallback(params.error);
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      };

      self.rpc.registerCallbackObject(port);
      self.rpc.executeRPC(port);
    }, errorCallback);
  };

  webinos.util.inherits(FileWriter, webinos.util.EventTarget);
  function FileWriter(entry) {
    webinos.util.EventTarget.call(this);

    this.entry = entry;

    this.readyState = FileWriter.INIT;
    this.length = 0;
    this.position = 0;

    this.service = entry.filesystem.service;
    this.rpc = entry.filesystem.service.rpc;

    this.addEventListener("writestart", function (event) {
      webinos.util.callback(this.onwritestart)(event);
    });
    this.addEventListener("progress", function (event) {
      webinos.util.callback(this.onprogress)(event);
    });
    this.addEventListener("abort", function (event) {
      webinos.util.callback(this.onabort)(event);
    });
    this.addEventListener("write", function (event) {
      webinos.util.callback(this.onwrite)(event);
    });
    this.addEventListener("writeend", function (event) {
      webinos.util.callback(this.onwriteend)(event);
    });
    this.addEventListener("error", function (event) {
      webinos.util.callback(this.onerror)(event);
    });
  }

  FileWriter.INIT = 0;
  FileWriter.WRITING = 1;
  FileWriter.DONE = 2;

  function BlobIterator(blob) {
    this.blob = blob;
    this.position = 0;
  }

  BlobIterator.prototype.hasNext = function () {
    return this.position < this.blob.size;
  };

  BlobIterator.prototype.next = function () {
    if (!this.hasNext()) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    var end = Math.min(this.position + 16 * 1024, this.blob.size);
    var chunk;
    if (this.blob.slice) {
      chunk = this.blob.slice(this.position, end);
    } else if (this.blob.webkitSlice) {
      chunk = this.blob.webkitSlice(this.position, end);
    } else if (this.blob.mozSlice) {
      chunk = this.blob.mozSlice(this.position, end);
    }
    this.position = end;
    return chunk;
  };

  FileWriter.prototype.write = function (data) {
    var self = this;

    if (self.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    self.readyState = FileWriter.WRITING;
    self.dispatchEvent(new webinos.util.ProgressEvent("writestart"));

    var reader = new FileReader();
    // reader.onloadstart = function (event) {};
    // reader.onprogress = function (event) {};
    // reader.onabort = function (event) {};
    reader.onload = function () {
      var write = self.rpc.createRPC(remote, "write", { data : webinos.util.ab2hex(reader.result) });
      self.rpc.executeRPC(write, function (bytesWritten) {
        self.position += bytesWritten;
        self.length = Math.max(self.position, self.length);

        self.dispatchEvent(new webinos.util.ProgressEvent("progress"));
      });
    };
    // reader.onloadend = function (event) {};
    reader.onerror = function () {
      var destroy = self.rpc.createRPC(remote, "destroy");
      self.rpc.executeRPC(destroy, function () {
        try {
          self.error = reader.error;
          self.readyState = FileWriter.DONE;
          self.dispatchEvent(new webinos.util.ProgressEvent("error"));
          self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      });
    };

    var iterator = new BlobIterator(data);
    function iterate() {
      if (iterator.hasNext()) {
        reader.readAsArrayBuffer(iterator.next());
      } else {
        var end = self.rpc.createRPC(remote, "end");
        self.rpc.executeRPC(end, function () {
          try {
            self.readyState = FileWriter.DONE;
            self.dispatchEvent(new webinos.util.ProgressEvent("write"));
            self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
          } finally {
            self.rpc.unregisterCallbackObject(port);
          }
        });
      }
    }

    var remote;
    var port = self.rpc.createRPC(self.service, "write",
       { entry : self.entry
       , options : { start : self.position }
       });
    port.ref = function (params, successCallback, errorCallback, ref) {
      remote = ref;
    };
    port.open = function () {
      iterate();
    };
    port.drain = function () {
      iterate();
    };
    port.close = function () {};
    port.error = function (params) {
      try {
        self.error = params.error;
        self.readyState = FileWriter.DONE;
        self.dispatchEvent(new webinos.util.ProgressEvent("error"));
        self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
      } finally {
        reader.abort();

        self.rpc.unregisterCallbackObject(port);
      }
    };

    self.rpc.registerCallbackObject(port);
    self.rpc.executeRPC(port);
  };

  FileWriter.prototype.seek = function (offset) {
    if (this.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    this.position = offset;

    if (this.position > this.length) {
      this.position = this.length;
    }

    if (this.position < 0) {
      this.position = this.position + this.length;
    }

    if (this.position < 0) {
      this.position = 0;
    }
  };

  FileWriter.prototype.truncate = function (size) {
    var self = this;

    if (self.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    self.readyState = FileWriter.WRITING;
    self.dispatchEvent(new webinos.util.ProgressEvent("writestart"));

    var truncate = self.rpc.createRPC(self.service, "truncate", { entry : self.entry, size : size });
    self.rpc.executeRPC(truncate, function () {
      self.length = size;
      self.position = Math.min(self.position, size);

      self.readyState = FileWriter.DONE;
      self.dispatchEvent(new webinos.util.ProgressEvent("write"));
      self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
    }, function (error) {
      self.error = error;
      self.readyState = FileWriter.DONE;
      self.dispatchEvent(new webinos.util.ProgressEvent("error"));
      self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
    });
  };

  // FileWriter.prototype.abort = function () {
  //   if (this.readyState === FileWriter.DONE ||
  //       this.readyState === FileWriter.INIT) return;

  //   this.readyState = FileWriter.DONE;

  //   // If there are any tasks from the object's FileSaver task source in one of
  //   // the task queues, then remove those tasks.
  //   // Terminate the write algorithm being processed.

  //   this.error = new webinos.util.CustomError("AbortError");
  //   this.dispatchEvent(new webinos.util.ProgressEvent("abort"));
  //   this.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
  // };
})(webinos.file);
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
******************************************************************************/
(function() {

/**
 * Webinos Geolocation service constructor (client side).
 * @constructor
 * @param obj Object containing displayName, api, etc.
 */
WebinosGeolocation = function (obj) {
  exports.WebinosService.call(this, obj);
};
// Inherit all functions from WebinosService
WebinosGeolocation.prototype = Object.create(exports.WebinosService.prototype);
// The following allows the 'instanceof' to work properly
WebinosGeolocation.prototype.constructor = WebinosGeolocation;
// Register to the service discovery
_webinos.registerServiceConstructor("http://webinos.org/api/w3c/geolocation", WebinosGeolocation);
// If you want to enable the old URI, uncomment the following line
//_webinos.registerServiceConstructor("http://www.w3.org/ns/api-perms/geolocation", WebinosGeolocation);

/**
 * To bind the service.
 * @param bindCB BindCallback object.
 */
WebinosGeolocation.prototype.bindService = function (bindCB, serviceId) {
	// actually there should be an auth check here or whatever, but we just always bind
	this.getCurrentPosition = getCurrentPosition;
	this.watchPosition = watchPosition;
	this.clearWatch = clearWatch;
	
	if (typeof bindCB.onBind === 'function') {
		bindCB.onBind(this);
	};
}

/**
 * Retrieve the current position.
 * @param positionCB Success callback.
 * @param positionErrorCB Error callback.
 * @param positionOptions Optional options.
 */
function getCurrentPosition(positionCB, positionErrorCB, positionOptions) { 
	var rpc = webinos.rpcHandler.createRPC(this, "getCurrentPosition", positionOptions); // RPC service name, function, position options
	webinos.rpcHandler.executeRPC(rpc, function (position) {
		positionCB(position);
	},
	function (error) {
		positionErrorCB(error);
	});
};

var watchIdTable = {};

/**
 * Register a listener for position updates.
 * @param positionCB Callback for position updates.
 * @param positionErrorCB Error callback.
 * @param positionOptions Optional options.
 * @returns Registered listener id.
 */
function watchPosition(positionCB, positionErrorCB, positionOptions) {
	var rpc = webinos.rpcHandler.createRPC(this, "watchPosition", [positionOptions]);

	rpc.onEvent = function (position) {
		positionCB(position);
	};

	rpc.onError = function (err) {
		positionErrorCB(err);
	};

	webinos.rpcHandler.registerCallbackObject(rpc);
	webinos.rpcHandler.executeRPC(rpc);

	var watchId = parseInt(rpc.id, 16);
	watchIdTable[watchId] = rpc.id;

	return watchId;
};

/**
 * Clear a listener.
 * @param watchId The id as returned by watchPosition to clear.
 */
function clearWatch(watchId) {
	var _watchId = watchIdTable[watchId];
	if (!_watchId) return;

	var rpc = webinos.rpcHandler.createRPC(this, "clearWatch", [_watchId]);
	webinos.rpcHandler.executeRPC(rpc);

	delete watchIdTable[watchId];
	webinos.rpcHandler.unregisterCallbackObject({api:_watchId});
};

})();
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 ******************************************************************************/
(function() {

	PolicyManagementModule = function(obj) {
    exports.WebinosService.call(this, obj);
	};
	
	// Inherit all functions from WebinosService
	PolicyManagementModule.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	PolicyManagementModule.prototype.constructor = PolicyManagementModule;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/core/policymanagement", PolicyManagementModule);


    PolicyManagementModule.prototype.bindService = function (bindCB, serviceId) {
        this.policy = policy;
        this.policyset = policyset;
        this.getPolicySet = getPolicySet;
        this.testPolicy = testPolicy;
        this.testNewPolicy = testNewPolicy;
        this.save = save;

        if (typeof bindCB.onBind === 'function') {
            bindCB.onBind(this);
        };
    }


    var policy = function(ps, id, combine, description){

        var _ps = ps;
        if(ps)
            _ps = ps;
        else{
            _ps = {};
            _ps['$'] = {};
            _ps['$']["id"] = (id) ? id : getNewId();
        }

        if(combine)
            _ps['$']["combine"] = combine;
        if(description)
            _ps['$']["description"] = description;

        function getNewId(type) {
            return new Date().getTime();
        };

        this.getInternalPolicy = function(){
            return _ps;
        };

        //this.updateRule = function(ruleId, effect, updatedCondition){
        this.updateRule = function(ruleId, key, value){
            if(!_ps) {
                return null;
            }

//            if(effect != 'permit' && effect != 'prompt-oneshot' && effect != 'prompt-session' && effect != 'prompt-blanket' && effect != 'deny') {
//                effect = "";
//            }

            //console.log("Effect :: "+effect);
            var policy = _ps;
            var rule;
            var count=0;
            for(var i in policy["rule"]) {
                if(policy["rule"][i]['$']["id"] == ruleId) {
                    rule = policy["rule"][i];
                    break;
                }
                count++;
            }

            if(rule){


                if(key == "effect"){
                    if(value)
                        rule['$']["effect"] = value;
                    else
                        rule['$']["effect"] = "permit";
                }
                else if(key == "condition"){

                    if(value){
                        if(rule.condition){
                            //check first child
                            var parent = rule["condition"];

                            var tmp = parent[0];
                            console.log(JSON.stringify(rule["condition"]));
                            if(tmp['$']["id"] == value['$']["id"]){
                                parent[0] = value;
                                return;
                            }

                            //check other children
                            while(true){
                                if(tmp.condition && value){

                                    if(tmp.condition[0]['$']["id"] == value['$']["id"]){
                                        tmp.condition[0] = value;
                                        return;
                                    }
                                    else
                                        tmp = tmp.condition;
                                }
                                else
                                    break;
                            }
                        }
                        else{
                            rule["condition"] = [value];
                        }
                    }
                    else{
                        if(rule.condition){
                            rule.condition = undefined;
                        }
                        else
                        {
                            ;
                        }
                    }
                }
/*
                if(!updatedCondition)
                    if(rule["condition"])
                        rule["condition"] = undefined;

                else if(!rule.condition){
                    console.log("No condition");
                    rule["condition"] = new Array();
                    rule["condition"][0] = updatedCondition;
                }

                else{

                    //check first child
                    var parent = rule["condition"];

                    var tmp = parent[0];

                    if(tmp['$']["id"] == updatedCondition['$']["id"]){
                        parent[0] = updatedCondition;
                        return;
                    }

                    //check other children
                    while(true){
                        if(tmp.condition && updatedCondition){
                            if(tmp.condition[0]['$']["id"] == updatedCondition['$']["id"]){
                                tmp.condition[0] = updatedCondition;
                                return;
                            }
                            else
                                tmp = tmp.condition;
                        }
                        else
                            break;
                    }
                }*/
            }
        }

        this.addRule = function(newRuleId, effect, newCondition, rulePosition){
            if(!_ps) {
                return null;
            }

            //Check if effect is valid value (deny is included in default rule)
            if(effect != 'permit' && effect != 'prompt-oneshot' && effect != 'prompt-session' && effect != 'prompt-blanket' && effect != 'deny') {
                effect = "permit";
            }

            //console.log("Effect :: "+effect);
            var policy = _ps;

            var rule;
            for(var i in policy['rule']) {
                if(policy['rule'][i]['$']['effect'] == effect) {
                    rule = policy['rule'][i];
                    break;
                }
            }
            //console.log("rule :: "+rule);

            if(!rule){
                var id = (newRuleId) ? newRuleId : new Date().getTime();
                rule = {"$": {"id" : id, "effect" : effect}};
                var position = 0;
                if(rulePosition && (rulePosition<0 || policy["rule"].length == 0))
                    policy["rule"].length;
                if(!rulePosition && policy["rule"])
                    position = policy["rule"].length;

                console.log("position : "+position);
                if(!policy["rule"])
                    policy["rule"] = [rule];
                else
                    policy["rule"].splice(position, 0, rule);
            }

            if(newCondition){
                if(!rule.condition){
                    console.log("No condition");
                    rule["condition"] = [newCondition];
                }
                else{
                    var tmp = rule["condition"][0];
                    while(true){
                        if(tmp.condition){
                            tmp = tmp.condition[0];
                        }
                        else
                            break;
                    }

                    tmp["condition"] = [newCondition];
                }
            }
        };

        this.removeRule = function(ruleId) {
            if(!_ps) {
                return null;
            }
            if(ruleId == null) {
                return null;
            }

            var policy = _ps;

            //console.log("PRE : " + JSON.stringify(policy["rule"]));
            if(policy["rule"]){
                var index = -1;
                var count = 0;

                for(var i in policy["rule"]){
                    if(policy["rule"][i]["$"]["id"] && policy["rule"][i]["$"]["id"] == ruleId){
                        index = i;
                        //break;
                    }
                    count ++;
                }
                if(index != -1){
                    console.log("Removing rule " + index);
                    policy["rule"].splice(index,1);
                    if(count == 1)
                        policy["rule"] = undefined;
                }


            }
            else
                console.log("No rules");
        };

        this.addSubject = function(newSubjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            var id = (newSubjectId) ? newSubjectId : new Date().getTime();
            var newsubj = {"$" : {"id" : id} , "subject-match" : [] };

            for(var i in matches){
                if(i == "subject-match")
                    newsubj["subject-match"].push(matches[i]);
            }

            if(!policy.target)
                policy.target = [{}];
            if(!policy.target[0]["subject"])
                policy.target[0]["subject"] = [];

            //console.log(JSON.stringify(policy.target[0]));
            for(var i =0; i<policy.target[0]["subject"].length; i++){
                    if(policy.target[0]["subject"][i]['$']["id"] == newSubjectId){
                        console.log("A subject with " + newSubjectId + " is already present");
                        return;
                    }
                }
            policy.target[0]["subject"].push(newsubj);
            //console.log(JSON.stringify(policy.target[0]));

        };
/*
        this.getSubjects = function(policyId){
            if(!_ps) {
                return null;
            }

            var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;

            if(policy == null) {
                return null;
            }
            var subjects = policy.target[0]["subject"];

            return subjects;
        };*/

        this.removeSubject = function(subjectId) {
            if(!_ps) {
                return null;
            }
            /*
            if(policyId == null) {
                return;
            }*/

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            var count = 0;

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        //break;
                    }
                    count++;
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                }
                if(count == 1)
                    //policy.target = [];
                    policy.target = undefined;
            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };

        this.updateSubject = function(subjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }
            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var subjects = policy.target[0]["subject"];
                for(var i in subjects){
                    if(subjects[i]['$']["id"] == subjectId)
                        subjects[i]["subject-match"] = matches["subject-match"];
                }
            }
        };

        this.updateAttribute = function(key, value){
            if (!key) {
                return;
            }
            if (key == "combine") {
                _ps['$']["combine"] = value;
            }
            else if (key == "description") {
                _ps['$']["description"] = value;
            }

        };

        this.toJSONObject = function(){
            return _ps;
        };
    };

    var policyset = function(ps ,type, basefile, fileId, id, combine, description) {
        var _type = type;
        var _basefile = basefile;
        var _fileId = fileId;

        var _parent;

        //var id = (newSubjectId) ? newSubjectId : new Date().getTime();
        var _ps = ps;
        if(ps)
            _ps = ps;
        else{
            _ps = {};
            _ps['$'] = {};
            _ps['$']["id"] = (id) ? id : getNewId();
        }

        if(combine)
            _ps['$']["combine"] = combine;
        if(description)
            _ps['$']["description"] = description;

        this.getBaseFile = function(){
            return _basefile;
        };

        this.getFileId = function(){
            return _fileId;
        };

        function getNewId(type) {
            return new Date().getTime();
        }

        function getPolicyById(policySet, policyId) {
            //console.log('getPolicyById - policySet is '+JSON.stringify(policySet));
            /*
            if(policyId == null || (policySet['$']['id'] && policySet['$']['id'] == policyId)) {
                return policySet;
            }
            */
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    if(policySet['policy'][j]['$']['id'] == policyId) {
                        return policySet['policy'][j];
                    }
                }
            }
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        return policySet['policy-set'][j];
                    }
                    var tmp = getPolicyById(policySet['policy-set'][j], policyId);
                    if(tmp != null) {
                        return tmp;
                    }
                }
            }
            return null;
        };

        function getPolicySetById(policySet, policyId) {
            //console.log('getPolicyById - policySet is '+JSON.stringify(policySet));

            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        return policySet['policy-set'][j];
                    }
                    var tmp = getPolicyById(policySet['policy-set'][j], policyId);
                    if(tmp != null) {
                        return tmp;
                    }
                }
            }
            return null;
        };

        function getPolicySetBySubject(policySet, subject) {
            var res = {'generic':[], 'matched':[]};
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    var checkRes = checkPolicySetSubject(policySet['policy-set'][j] , subject);
                    if (checkRes == 0){
                        res['generic'].push(new policyset(policySet['policy-set'][j], "policy-set"));
                    } else if (checkRes == 1){
                        res['matched'].push(new policyset(policySet['policy-set'][j], "policy-set"));
                    }
                    if (policySet['policy-set'][j]['policy-set']){
                        var tmpRes = getPolicySetBySubject(policySet['policy-set'][j], subject);
                        for (var e in tmpRes){
                            if (res[e] && tmpRes[e].length > 0){
                                res[e] = res[e].concat(tmpRes[e]);
                            }
                        }
                    }
                }
            }
            return res;
        }

        function checkPolicySetSubject(policySet, subject) {
            psSubject = null;
            var tempSubject = JSON.parse(JSON.stringify(subject));
            try{
                psSubject = policySet['target'][0]['subject'];
            }
            catch(err) {
                return 0; //subject not specified (it's still a subject match)
            }
            if (psSubject){
                for (var i in psSubject) {
                    temp = null;
                    try {
                        temp = psSubject[i]['subject-match'][0]['$']['match'];
                    } catch (err) { continue; }

                    // Change the string of psSubjectMatch_i to array psSubjectMatch_i.
                    var psSubjectMatch_i = temp.split(',');


                    if(psSubjectMatch_i.length > 1) {
                        for(var j in psSubjectMatch_i) {
                            // psSubjectMatch_i_j = null;
                            try {
                                var psSubjectMatch_i_j = psSubjectMatch_i[j];
                            } catch(err) { continue; }

                            var index = tempSubject.indexOf(psSubjectMatch_i_j);
                            if (index > -1){
                                //numMatchedSubjects++;
                                tempSubject.splice(index,1);
                            }
                        }
                    } else {
                        var index = tempSubject.indexOf(psSubjectMatch_i[0]);
                        if (index > -1) {
                            tempSubject.splice(index,1);
                        }
                    }
                }
                if (tempSubject.length == 0){
                    return 1; //subject matches
                }
            }
            return -1; //subject doesn't match
        }

        function getPolicyBySubject(policySet, subject) {
            var res = {'generic':[], 'matched':[]};
            // if(policySet['policy'] && checkPolicySetSubject(policySet, subject) > -1) {
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    var tempSubject = JSON.parse(JSON.stringify(subject));
                    pSubject = null;
                    try{
                        pSubject = policySet['policy'][j]['target'][0]['subject'];
                    }
                    catch(err) {
                        res['generic'].push(new policy(policySet['policy'][j]));
                    }
                    if (pSubject){
                        // var numMatchedSubjects = 0;
                        for (var i in pSubject) {
                            temp = null;
                            // pSubjectMatch_i = null;
                            try {
                                // pSubjectMatch_i = pSubject[i]['subject-match'][0]['$']['match'];
                                temp = pSubject[i]['subject-match'][0]['$']['match'];
                            } catch (err) { continue; }

                            var pSubjectMatch_i = temp.split(',');
                            if (pSubjectMatch_i.length > 1) {

                                for (var m in pSubjectMatch_i) {
                                    // pSubjectMatch_i_j = null;
                                    try {
                                        var pSubjectMatch_i_j = pSubjectMatch_i[m];
                                    } catch(err) { continue; }

                                    var index = tempSubject.indexOf(pSubjectMatch_i_j);
                                    if (index > -1){
                                        // numMatchedSubjects++;
                                        tempSubject.splice(index,1);
                                    }
                                }

                            } else {
                                var index = tempSubject.indexOf(pSubjectMatch_i[0]);
                                if (index > -1){
                                    // numMatchedSubjects++;
                                    tempSubject.splice(index,1);
                                }
                            }
                            if (tempSubject.length == 0) {
                                res['matched'].push(new policy(policySet['policy'][j]));
                                break;
                            }
                        }
                    }
                }
            }

            /*if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    var tmpRes = getPolicyBySubject(policySet['policy-set'][j], subject);
                    for (var e in tmpRes){
                        if (res[e] && tmpRes[e].length > 0){
                            res[e] = res[e].concat(tmpRes[e]);
                        }
                    }
                }
            }*/
            return res;
        }

        this.removeSubject = function(subjectId, policyId) {
            if(!_ps) {
                return null;
            }
            if(policyId == null) {
                return;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            if(policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        break;
                    }
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                }
            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };


        function removePolicySetById(policySet, policySetId) {
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policySetId) {
                        policySet['policy-set'].splice(j, 1);
                        return true;
                    }
                    /*if(removePolicyById(policySet['policy-set'][j], policyId)) {
                        return true;
                    }*/
                }
            }
            return false;
        }

        function removePolicyById(policySet, policyId) {
            //console.log('removePolicyById - id is '+policyId+', set is '+JSON.stringify(policySet));
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    if(policySet['policy'][j]['$']['id'] == policyId) {
                        policySet['policy'].splice(j, 1);
                        return true;
                    }
                }
            }
            /*
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        policySet['policy-set'].splice(j, 1);
                        return true;
                    }
                    if(removePolicyById(policySet['policy-set'][j], policyId)) {
                        return true;
                    }
                }
            }*/
            return false;
        }

        this.getInternalPolicySet = function(){
            return _ps;
        };

        this.createPolicy = function(policyId, combine, description){
//        function createPolicy(policyId, combine, description){
            return new policy(null, policyId, combine, description);
        };

        this.createPolicySet = function(policySetId, combine, description){
       //function createPolicySet(policySetId, combine, description){
            return new policyset(null, policySetId, _basefile, _fileId, policySetId, combine, description);
        };


      this.addPolicy = function(newPolicy, newPolicyPosition){
//      this.addPolicy = function(policyId, combine, description, newPolicyPosition, succCB){
//      var newPolicy = createPolicy(policyId, combine, description);
            if(!_ps)
                return null;

            if(!_ps["policy"])
                _ps["policy"] = new Array();
            else{
                for(var i =0; i<_ps["policy"].length; i++){
                    console.log(JSON.stringify(newPolicy.getInternalPolicy()));
                    if(_ps["policy"][i]['$']["id"] == newPolicy.getInternalPolicy()['$']["id"]){
                        console.log("A policy with " + newPolicy.getInternalPolicy()['$']["id"] + " is already present");
                        return;
                    }
                }
            }
            var position = (newPolicyPosition == undefined || newPolicyPosition<0 || _ps["policy"].length == 0) ? _ps["policy"].length : newPolicyPosition;
            _ps['policy'].splice(position, 0, newPolicy.getInternalPolicy());
            //succCB(newPolicy);

        };

        this.addPolicySet = function(newPolicySet, newPolicySetPosition){
        //this.addPolicySet = function(policySetId, combine, description, newPolicySetPosition){
            //var newPolicySet = createPolicySet(policySetId, combine, description);
            if(!_ps)
                return null;

            if(!_ps['policy-set'])
                _ps['policy-set'] = new Array();
            else{
                for(var i =0; i<_ps['policy-set'].length; i++){
                    console.log(JSON.stringify(newPolicySet.getInternalPolicySet()));
                    if(_ps['policy-set'][i]['$']['id'] == newPolicySet.getInternalPolicySet()['$']['id']){
                        console.log("A policyset with " + newPolicySet.getInternalPolicySet()['$']['id'] + " is already present");
                        return;
                    }
                }
            }
            var position = (newPolicySetPosition == undefined || newPolicySetPosition<0 || _ps['policy-set'].length == 0) ? _ps['policy-set'].length : newPolicySetPosition;
            _ps['policy-set'].splice(position, 0, newPolicySet.getInternalPolicySet());
            /*
            if(!_ps)
                return null;

            if(!_ps["policy-set"])
                _ps["policy-set"] = new Array();

            var position = (newPolicySetPosition == undefined || newPolicySetPosition<0 || _ps["policy-set"].length == 0) ? _ps["policy-set"].length : newPolicySetPosition;
//            var position = (!newPolicySetPosition || _ps["policy-set"].length == 0) ? 0 : newPolicySetPosition;

            _ps['policy-set'].splice(position, 0, newPolicySet.getInternalPolicySet());
            */
        };



        // add subject to policyset
        this.addSubject = function(newSubjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            var id = (newSubjectId) ? newSubjectId : new Date().getTime(); //Ecco perchè inserendo ID vuoto metto la data
            var newsubj = {"$" : {"id" : id} , "subject-match" : [] };

            for(var i in matches){
                if(i == "subject-match")
                    newsubj["subject-match"].push(matches[i]);
            }
            if(!policy.target)
                policy.target = [{}];

            if(!policy.target[0]["subject"])
                policy.target[0]["subject"] = [];

            //console.log(JSON.stringify(policy.target[0]));
            for(var i =0; i<policy.target[0]["subject"].length; i++){
                    if(policy.target[0]["subject"][i]['$']["id"] == newSubjectId){
                        console.log("A subject with " + newSubjectId + " is already present");
                        return;
                    }
                }
            policy.target[0]["subject"].push(newsubj);
            //console.log(JSON.stringify(policy.target[0]));

        };

        this.getPolicy = function(policyId){
            if (policyId){
                if(typeof policyId == "object" && policyId.length){
                    var res = getPolicyBySubject(_ps, policyId);
                    var tempSubject = replaceId(policyId);
                    // Because of the default copying action, the tempSubject can never be zero.
                    if ((tempSubject.indexOf("http://webinos.org/subject/id/PZ-Owner") != -1) || (tempSubject.indexOf("http://webinos.org/subject/id/known") != -1 )) {
                        var res2 = getPolicyBySubject(_ps, tempSubject);
                        var res = joinResult(res, res2);
                    }
                    return res;
                } else {
                    var tmp = getPolicyById(_ps, policyId);
                    if(tmp){
                        return new policy(tmp);
                    }
                }
            }
        };

        this.getPolicySet = function(policySetId){
            if(policySetId){
                if(typeof policySetId == "object" && policySetId.length){
                    var res = getPolicySetBySubject(_ps, policySetId);
                    var tempSubject = replaceId(policySetId);
                    if ((tempSubject.indexOf("http://webinos.org/subject/id/PZ-Owner") != -1) || (tempSubject.indexOf("http://webinos.org/subject/id/known") !=-1 )) {
                        var res2 = getPolicySetBySubject(_ps, tempSubject);
                        var res = joinResult(res, res2);
                    }
                    return res;
                } else {
                    var tmp = getPolicySetById(_ps, policySetId);
                    if(tmp){
                        return new policyset(tmp, "policy-set", _basefile, _fileId);
                    }
                }
            }
        };

/*
        this.getSubjects = function(policyId){
            if(!_ps) {
                return null;
            }

            var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;

            if(policy == null) {
                return null;
            }
            var subjects = policy.target[0]["subject"];

            return subjects;
        };
*/
        this.updateSubject = function(subjectId, matches){
        //this.updateSubject = function(subjectId, matches/*, policyId*/ ){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var subjects = policy.target[0]["subject"];
                for(var i in subjects){
                    console.log(subjects[i]['$']["id"]);
                    if(subjects[i]['$']["id"] == subjectId)
                        subjects[i]["subject-match"] = matches["subject-match"];
                }
            }
        };

        this.removePolicy = function(policyId){
            if(!_ps) {
                return null;
            }
            if(policyId == null) {
                return;
            }
            if (!_ps['policy']) {
                return null;
            }
            removePolicyById(_ps, policyId);
            if (_ps['policy'].length == 0) {
                _ps['policy'] = undefined;
            }
        };

        this.removePolicySet = function(policySetId){
            if(!_ps) {
                return null;
            }
            if(policySetId == null) {
                return;
            }
            if (!_ps['policy-set']) {
                return null;
            }
            removePolicySetById(_ps, policySetId);
            console.log(_ps['policy-set']);
            if (_ps['policy-set'].length == 0) {
                _ps['policy-set'] = undefined;
            }
        };



        this.removeSubject = function(subjectId) {
            if(!_ps) {
                return null;
            }
            /*
            if(policyId == null) {
                return;
            }*/

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            var count = 0;

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        //break;
                    }
                    count++;
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                    if(count == 1)
                        policy.target = undefined;
                }

            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };

        this.updateAttribute = function(key, value){
          if(key == "combine" || key == "description"){
            _ps['$'][key] = value;
          }
        };
        /*function(policySetId, combine, description){
            if(policySetId)
                _ps['$']["id"] = policySetId;
            if(combine)
                _ps['$']["combine"] = combine;
            if(description)
                _ps['$']["description"] = description;};*/


        this.toJSONObject = function(){
            return _ps;
            //return "ID : " + _id + ", DESCRIPTION : " + _ps.$.description + ", PATH : " + _basefile;
        }
    }

    var policyFiles = new Array();

    function getPolicySet(policyset_id, success, error) {
        var successCB = function(params){
            var ps = new policyset(params, "policy-set", policyset_id) ;
            console.log(ps);
            success(ps);
        }

        if(!policyFiles || policyFiles.length == 0) {
            var rpc = webinos.rpcHandler.createRPC(this, "getPolicy", [policyset_id]); // RPC service name, function, position options
            webinos.rpcHandler.executeRPC(rpc
                , function (params) {
                    successCB(params);
                }
                , function (error) {
                    console.log(error);
                }
            );
        }
        else {
            success(new policyset(policyFiles[policyset_id].content, "policy-set", policyset_id));
        }
    };

    function save(policyset, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "setPolicy", [policyset.getBaseFile(), JSON.stringify(policyset.toJSONObject())]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };

    function testPolicy(policyset, request, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "testPolicy", [policyset.getBaseFile(), JSON.stringify(request)]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };
    function testNewPolicy(policyset, request, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "testNewPolicy", [JSON.stringify(policyset.toJSONObject()), JSON.stringify(request)]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };

// Start point..............
// This function is used to test if the userId belongs to the friends array.
    function userBelongsToFriend(userId) {
        if (userId !== webinos.session.getPZHId()) {
            var friends = webinos.session.getConnectedPzh();
            var index = friends.indexOf(userId);
            if (index > -1){
                return 1;
            }
        }
        return 0;
    }
// This function is used to replace the elements (ids) in the subject, and to  make it simple, only two possible values, one is the generic URI of zone owner, and another is the friends. Then return the changed subject (tempSubject).
    function replaceId(subject) {
        var friendFound = false;
        var tempSubject = [];

        var zoneOwner = webinos.session.getPZHId();
        if (!zoneOwner) {
            zoneOwner = webinos.session.getPZPId();
        }

        for (var j in subject) {
            if (subject[j] === zoneOwner) {
                tempSubject.push("http://webinos.org/subject/id/PZ-Owner");
            } else if (userBelongsToFriend(subject[j])) {
                if (friendFound == false) {
                    tempSubject.push("http://webinos.org/subject/id/known");
                    friendFound = true;
                }
            // do nothing if friendFound is true
            } else {
                // default behaviour, copy item
                tempSubject.push(subject[j]);
            }
        }
        return tempSubject;
    }

    function deepCopy(p,c) {
        var c = c || {};
        for (var i in p) {
            if (typeof p[i] === 'object') {
                c[i] = (p[i].constructor === Array) ? [] : {};
                deepCopy(p[i], c[i]);
            }
            else {
                c[i] = p[i];
            }
        }
        return c;
    }

// This function used to join two results together, res2 only can have two elements at most, one in the generic set and one in the matched set. So ckecked them one by one is the easiest solution. To avoid duplication, in both if functions, also check if the element in the res2 already presented in the res1, if already presented, skip this step, other wise push the element in res1, and return res1.
    function joinResult(res1, res2) {
        var found_g = false, found_m = false;
        var res = deepCopy(res1);
        for (var i in res2['generic']) {
            for (var j in res1['generic']) {
                if (res1['generic'][j].toJSONObject() === res2['generic'][i].toJSONObject() ) {
                    found_g = true;
                    break;
                }
            }
            if (found_g == false) {
                res['generic'].push(res2['generic'][i]);
            }
            found_g = false;
        }

        for (var m in res2['matched']) {
            for (var n in res1['matched']) {
                if (res1['matched'][n].toJSONObject() === res2['matched'][m].toJSONObject() ) {
                    found_m = true;
                    break;
                }
            }
            if (found_m == false) {
                res['matched'].push(res2['matched'][m]);
            }
            found_m = false;
        }

        return res;
    }
})();
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2013 EPU-National Technical University of Athens
 * Author: Christos Botsikas, NTUA
 ******************************************************************************/

(function () {
    var tokenId=null;
//    var pendingResponse = false;
//    if (tokenId = window.location.search.match(/(?:[?&])tokenId=([a-zA-Z0-9-_]*)(?:&.*|)$/)){
    if (false) {
       tokenId = tokenId[1];
    }else if (typeof widget !== 'undefined' && widget.args && widget.args.tokenId){
        tokenId = widget.args.tokenId;
    }
    var Dashboard = function(rpcHandler){
        this.open = function(options, successCB, errorCB){
            if (typeof successCB != "function") successCB = function(){};
            if (typeof errorCB != "function") errorCB = function(){};
            var rpc = rpcHandler.createRPC('Dashboard', 'open', {options:options});
            webinos.rpcHandler.executeRPC(rpc,
                function (params){
                    successCB(params);
                },
                function (error){
                    errorCB(error);
                }
            );
            return {
                onAction: function(callback){
                    if (typeof callback != "function") return;
                    rpc.onAction = function(params){
                        callback(params);
                        webinos.rpcHandler.unregisterCallbackObject(rpc);
                    };
                    webinos.rpcHandler.registerCallbackObject(rpc);
                }
            }
        };
        this.getData = function(successCB, errorCB){
            if (tokenId == null){
                errorCB("No token found.");
                return;
            }
            this.getDataForTokenId(tokenId, successCB, errorCB);
        };
        this.getDataForTokenId = function(tokenId, successCB, errorCB){
            if (typeof successCB != "function") successCB = function(){};
            if (typeof errorCB != "function") errorCB = function(){};
            var rpc = rpcHandler.createRPC('Dashboard', 'getTokenData', {tokenId:tokenId});
            webinos.rpcHandler.executeRPC(rpc,
                function (params){
//                    pendingResponse = true;
                    successCB(params);
                },
                function (error){
                    errorCB(error);
                }
            );
        };
        this.actionComplete = function(data, successCB, errorCB){
            if (tokenId == null){
                errorCB("No token found.");
                return;
            }
            pendingResponse = false;
            if (typeof successCB != "function") successCB = function(){};
            if (typeof errorCB != "function") errorCB = function(){};
            var rpc = rpcHandler.createRPC('Dashboard', 'actionComplete', {tokenId:tokenId, data:data});
            webinos.rpcHandler.executeRPC(rpc,
                function (params){
                    successCB(params);
                },
                function (error){
                    errorCB(error);
                }
            );
        };
    };

    webinos.dashboard = new Dashboard(webinos.rpcHandler);
}());
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2012 Andr� Paul, Fraunhofer FOKUS
******************************************************************************/
(function() {

	//AppLauncher Module Functionality
	
	/**
	 * Webinos AppLauncher service constructor (client side).
	 * @constructor
	 * @param obj Object containing displayName, api, etc.
	 */
	AppLauncherModule = function(obj) {
		this.base = WebinosService;
		this.base(obj);
	};
	
	AppLauncherModule.prototype = new exports.WebinosService();

	/**
	 * To bind the service.
	 * @param bindCB BindCallback object.
	 */
	AppLauncherModule.prototype.bind = function(bindCB) {
		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
	};
	
	/**
	 * Launches an application.
	 * @param successCallback Success callback.
	 * @param errorCallback Error callback.
	 * @param appURI Application ID to be launched.
	 */
	AppLauncherModule.prototype.launchApplication = function (successCallback, errorCallback, appURI){

		var rpc = webinos.rpcHandler.createRPC(this, "launchApplication", [appURI]);
		webinos.rpcHandler.executeRPC(rpc,
				function (params){
					successCallback(params);
				},
				function (error){
					errorCallback(error);
				}
		);

	};
    
	/**
	 * Reports if an application is isntalled.
	 * [not yet implemented]
	 * @param applicationID Application ID to test if installed.
	 * @returns Boolean whether application is installed.
	 */
	AppLauncherModule.prototype.appInstalled = function(successCallback, errorCallback, appURI){

		var rpc = webinos.rpcHandler.createRPC(this, "appInstalled", [appURI]);
		webinos.rpcHandler.executeRPC(rpc,
				function (params){
					successCallback(params);
				},
				function (error){
					errorCallback(error);
				}
		);
    
	};
	
	
}());/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2013 EPU-National Technical University of Athens
 * Author: Christos Botsikas, NTUA
 ******************************************************************************/

(function () {
    var Service = function (obj, rpcHandler) {
      exports.WebinosService.call(this, obj);
        this.rpcHandler = rpcHandler;
    };
	// Inherit all functions from WebinosService
	Service.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	Service.prototype.constructor = Service;
	// Register to the service discovery
    _webinos.registerServiceConstructor("http://webinos.org/api/db", Service);

    Service.prototype.open = function (successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self, "dbOpen");
        self.rpcHandler.executeRPC(rpc
            , function (dbName) {
                successCallback(new Database(self, dbName));
            }
            , errorCallback
        );
    };

    var Database = function (service, name) {
        this.service = service;
        this.name = name;

        this.rpcHandler = service.rpcHandler;
    };

    /**
     * collectionNames([collectionName], [options], [successCallback, [errorCallback]])
     * @param collectionName
     * @param options
     * @param successCallback
     * @param errorCallback
     */
    Database.prototype.collectionNames = function (collectionName, options, successCallback, errorCallback) {
        if (typeof collectionName !== "string" && collectionName != null) {
            errorCallback = successCallback;
            successCallback = options;
            options = collectionName;
            collectionName = null;
        }
        if (typeof options !== "object") {
            errorCallback = successCallback;
            successCallback = options;
            options = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "dbCollectionNames", {collectionName: collectionName, options: options});
        self.rpcHandler.executeRPC(rpc
            , function (collections) {
                if (options.namesOnly) {
                    successCallback(collections);
                } else {
                    successCallback(collections.map(function (collectionName) {
                        return new Collection(self, collectionName);
                    }));
                }
            }
            , errorCallback);
    };
    Database.prototype.collection = function (collectionName, successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "dbCollection", {collectionName: collectionName});
        self.rpcHandler.executeRPC(rpc
            , function (collectionName) {
                successCallback(new Collection(self, collectionName));
            }
            , errorCallback
        );
    };
    Database.prototype.createCollection = function (collectionName, successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "dbCreateCollection", {collectionName: collectionName});
        self.rpcHandler.executeRPC(rpc
            , function (collectionName) {
                successCallback(new Collection(self, collectionName));
            }
            , errorCallback
        );
    };

    Database.prototype.dropCollection = function (collectionName, successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "dbDropCollection", {collectionName: collectionName});
        self.rpcHandler.executeRPC(rpc
            , successCallback
            , errorCallback
        );
    };

    Database.prototype.renameCollection = function (fromCollection, toCollection, options, successCallback, errorCallback) {
        if (typeof options == 'function') {
            errorCallback = successCallback;
            successCallback = options;
            options = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "dbRenameCollection", {fromCollection: fromCollection, toCollection: toCollection, options: options});
        self.rpcHandler.executeRPC(rpc
            , function (collectionName) {
                successCallback(new Collection(self, collectionName));
            }
            , errorCallback
        );
    };

    var Collection = function (database, name) {
        this.database = database;
        this.name = name;

        this.service = database.service;
        this.rpcHandler = database.rpcHandler;
    };

    Collection.prototype.insert = function (docs, successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionInsert", {collectionName: self.name, docs: docs});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.remove = function (selector, successCallback, errorCallback) {
        if (typeof selector === "function"){
            errorCallback = successCallback;
            successCallback  = selector;
            selector = null;
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionRemove", {collectionName: self.name, selector: selector});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.update = function (selector, document, options, successCallback, errorCallback) {
        if (typeof options === "function"){
            errorCallback = successCallback;
            successCallback  = options;
            options = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionUpdate", {collectionName: self.name, selector: selector, document: document, options: options});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.distinct = function (key, query, successCallback, errorCallback) {
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionDistinct", {collectionName: self.name, key: key, query: query});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.count = function (query, successCallback, errorCallback) {
        if (typeof query === "function"){
            errorCallback = successCallback;
            successCallback  = query;
            query = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionCount", {collectionName: self.name, query: query});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.find = function (selector, options, successCallback, errorCallback) {
        if (typeof options === "function"){
            errorCallback = successCallback;
            successCallback  = options;
            options = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionFind", {collectionName: self.name, selector: selector, options: options});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

    Collection.prototype.findOne = function (selector, options, successCallback, errorCallback) {
        if (typeof options === "function"){
            errorCallback = successCallback;
            successCallback  = options;
            options = {};
        }
        var self = this;
        var rpc = self.rpcHandler.createRPC(self.service, "collectionFindOne", {collectionName: self.name, selector: selector, options: options});
        self.rpcHandler.executeRPC(rpc, successCallback, errorCallback);
    };

})();
(function() {

WebinosDeviceOrientation = function (obj) {
  exports.WebinosService.call(this, obj);
};

	// Inherit all functions from WebinosService
	WebinosDeviceOrientation.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	WebinosDeviceOrientation.prototype.constructor = WebinosDeviceOrientation;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/deviceorientation", WebinosDeviceOrientation);

var _referenceMappingDo = new Array();
var _eventIdsDo = new Array('deviceorientation', 'compassneedscalibration', 'devicemotion');

WebinosDeviceOrientation.prototype.bindService = function (bindCB, serviceId) {
	// actually there should be an auth check here or whatever, but we just always bind
	this.addEventListener = addEventListener;
	this.removeEventListener = removeEventListener;
	this.dispatchEvent = dispatchEvent;
	
    //Objects
    this.DeviceOrientationEvent = DeviceOrientationEvent;
    this.DeviceMotionEvent = DeviceMotionEvent;
    this.Acceleration = Acceleration;
    this.RotationRate = RotationRate;
    
    
    
    
	if (typeof bindCB.onBind === 'function') {
		bindCB.onBind(this);
	};
}

function addEventListener(type, listener, useCapture) {
    
    if(_eventIdsDo.indexOf(type) != -1){	
    
            console.log("LISTENER"+ listener);
    
			var rpc = webinos.rpcHandler.createRPC(this, "addEventListener", [type, listener, useCapture]);
			_referenceMappingDo.push([rpc.id, listener]);

			console.log('# of references' + _referenceMappingDo.length);	
			rpc.onEvent = function (orientationEvent) {
				listener(orientationEvent);
			};
            
			webinos.rpcHandler.registerCallbackObject(rpc);
			webinos.rpcHandler.executeRPC(rpc);
		}else{
			console.log(type + ' not found');	
		}
};

//DEFINITION BASE EVENT
WDomEvent = function(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp){
	this.initEvent(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp);
}

WDomEvent.prototype.speed = 0;

WDomEvent.prototype.initEvent = function(type, target, currentTarget, eventPhase, bubbles, cancelable, timestamp){
    this.type = type;
    this.target = target;
    this.currentTarget = currentTarget;
    this.eventPhase = eventPhase;
    this.bubbles = bubbles;
    this.cancelable  = cancelable;
    this.timestamp = timestamp; 
}


DeviceOrientationEvent = function(alpha, beta, gamma){
	this.initDeviceOrientationEvent(alpha, beta, gamma);
}

DeviceOrientationEvent.prototype = new WDomEvent();
DeviceOrientationEvent.prototype.constructor = DeviceOrientationEvent;
DeviceOrientationEvent.parent = WDomEvent.prototype; // our "super" property

DeviceOrientationEvent.prototype.initDeviceOrientationEvent = function(alpha, beta, gamma){
	this.alpha = alpha;
	this.beta = beta;
	this.gamma = gamma;
    
    var d = new Date();
    var stamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    var stamp = stamp + d.getUTCMilliseconds();
    
	DeviceOrientationEvent.parent.initEvent.call(this,'deviceorientation', null, null, null, false, false, stamp);
}
Acceleration = function(x,y,z){
	this.x = x;
	this.y = y;
	this.z = z;
}
RotationRate = function(alpha, beta, gamma){
	this.alpha = alpha;
	this.beta = beta;
	this.gamma = gamma;
}
DeviceMotionEvent = function(acceleration, accelerationIncludingGravity, rotationRate, interval){
	this.initDeviceMotionEvent(acceleration, accelerationIncludingGravity, rotationRate, interval);
}
DeviceMotionEvent.prototype = new WDomEvent();
DeviceMotionEvent.prototype.constructor = DeviceOrientationEvent;
DeviceMotionEvent.parent = WDomEvent.prototype; // our "super" property

DeviceMotionEvent.prototype.initDeviceMotionEvent = function(acceleration, accelerationIncludingGravity, rotationRate, interval){
	this.acceleration = acceleration;
	this.accelerationIncludingGravity = accelerationIncludingGravity;
	this.rotationRate = rotationRate;
	this.interval = interval;
    var d = new Date();
    var stamp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    var stamp = stamp + d.getUTCMilliseconds();
	DeviceOrientationEvent.parent.initEvent.call(this,'devicemotion', null, null, null, false, false, stamp);
}

function removeEventListener(type, listener, useCapture) {
        console.log("LISTENER"+ listener);
        var refToBeDeleted = null;
		for(var i = 0; i < _referenceMappingDo.length; i++){
			console.log("Reference" + i + ": " + _referenceMappingDo[i][0]);
			console.log("Handler" + i + ": " + _referenceMappingDo[i][1]);
			if(_referenceMappingDo[i][1] == listener){
					var arguments = new Array();
					arguments[0] = _referenceMappingDo[i][0];
					arguments[1] = type;
					console.log("ListenerObject to be removed ref#" + _referenceMappingDo[i][0]);                                             
                    var rpc = webinos.rpcHandler.createRPC(this, "removeEventListener", arguments);
					webinos.rpcHandler.executeRPC(rpc,
						function(result){
							callOnSuccess(result);
						},
						function(error){
							callOnError(error);
						}
					);
					break;			
			}	
    }
};

function dispatchEvent(event) {
    //TODO
};

})();(function () {
	var PropertyValueSuccessCallback, ErrorCallback, DeviceAPIError, PropertyRef;

	DeviceStatusManager = function (obj) {
    exports.WebinosService.call(this, obj);
	};
	
	DeviceStatusManager.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	DeviceStatusManager.prototype.constructor = DeviceStatusManager;
	// Register in the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/devicestatus", DeviceStatusManager);

	DeviceStatusManager.prototype.bindService = function (bindCB, serviceId) {
		// actually there should be an auth check here or whatever, but we just always bind
		this.getComponents = getComponents;
		this.isSupported = isSupported;
		this.getPropertyValue = getPropertyValue;

		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
	}

	function getComponents (aspect, successCallback, errorCallback)	{
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.getComponents", [aspect]);
		webinos.rpcHandler.executeRPC(rpc,
			function (params) { successCallback(params); }
		);
		return;
	}

	function isSupported (aspect, property, successCallback)
	{
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.isSupported", [aspect, property]);
		webinos.rpcHandler.executeRPC(
			rpc, 
			function (res) { successCallback(res); }
		);
		return;
	}

	function getPropertyValue (successCallback, errorCallback, prop) {
		var rpc = webinos.rpcHandler.createRPC(this, "devicestatus.getPropertyValue", [prop]);
		webinos.rpcHandler.executeRPC(
			rpc, 
			function (params) { successCallback(params); },
			function (err) { errorCallback(err); }
		);
		return;
	};

	PropertyValueSuccessCallback = function () {};

	PropertyValueSuccessCallback.prototype.onSuccess = function (prop) {
		return;
	};

	ErrorCallback = function () {};

	ErrorCallback.prototype.onError = function (error) {
		return;
	};

	DeviceAPIError = function () {
		this.message = String;
		this.code = Number;
	};

	DeviceAPIError.prototype.UNKNOWN_ERR                    = 0;
	DeviceAPIError.prototype.INDEX_SIZE_ERR                 = 1;
	DeviceAPIError.prototype.DOMSTRING_SIZE_ERR             = 2;
	DeviceAPIError.prototype.HIERARCHY_REQUEST_ERR          = 3;
	DeviceAPIError.prototype.WRONG_DOCUMENT_ERR             = 4;
	DeviceAPIError.prototype.INVALID_CHARACTER_ERR          = 5;
	DeviceAPIError.prototype.NO_DATA_ALLOWED_ERR            = 6;
	DeviceAPIError.prototype.NO_MODIFICATION_ALLOWED_ERR    = 7;
	DeviceAPIError.prototype.NOT_FOUND_ERR                  = 8;
	DeviceAPIError.prototype.NOT_SUPPORTED_ERR              = 9;
	DeviceAPIError.prototype.INUSE_ATTRIBUTE_ERR            = 10;
	DeviceAPIError.prototype.INVALID_STATE_ERR              = 11;
	DeviceAPIError.prototype.SYNTAX_ERR                     = 12;
	DeviceAPIError.prototype.INVALID_MODIFICATION_ERR       = 13;
	DeviceAPIError.prototype.NAMESPACE_ERR                  = 14;
	DeviceAPIError.prototype.INVALID_ACCESS_ERR             = 15;
	DeviceAPIError.prototype.VALIDATION_ERR                 = 16;
	DeviceAPIError.prototype.TYPE_MISMATCH_ERR              = 17;
	DeviceAPIError.prototype.SECURITY_ERR                   = 18;
	DeviceAPIError.prototype.NETWORK_ERR                    = 19;
	DeviceAPIError.prototype.ABORT_ERR                      = 20;
	DeviceAPIError.prototype.TIMEOUT_ERR                    = 21;
	DeviceAPIError.prototype.INVALID_VALUES_ERR             = 22;
	DeviceAPIError.prototype.NOT_AVAILABLE_ERR              = 101;
	DeviceAPIError.prototype.code = Number;
	DeviceAPIError.prototype.message = Number;

	PropertyRef = function () {
		this.component = String;
		this.aspect = String;
		this.property = String;
	};

	PropertyRef.prototype.component = String;
	PropertyRef.prototype.aspect = String;
	PropertyRef.prototype.property = String;

}());
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.util === "undefined") webinos.util = {};

(function (exports) {
  exports.inherits = inherits;

  // webinos <3 inherits
  function inherits(c, p, proto) {
    proto = proto || {};
    var e = {};
    [c.prototype, proto].forEach(function (s) {
      Object.getOwnPropertyNames(s).forEach(function (k) {
        e[k] = Object.getOwnPropertyDescriptor(s, k);
      });
    });
    c.prototype = Object.create(p.prototype, e);
    c.super_ = p;
  }

  exports.CustomError = CustomError;

  inherits(CustomError, Error);
  function CustomError(name, message) {
    Error.call(this, message || name);

    this.name = name;
  }

  exports.EventTarget = EventTarget;

  function EventTarget() {}

  EventTarget.prototype.addEventListener = function (type, listener) {
    if (typeof this.events === "undefined") this.events = {};
    if (typeof this.events[type] === "undefined") this.events[type] = [];

    this.events[type].push(listener);
  };

  EventTarget.prototype.removeEventListener = function (type, listener) {
    if (typeof this.events === "undefined" ||
        typeof this.events[type] === "undefined") {
      return;
    }

    var position = this.events[type].indexOf(listener);
    if (position >= 0) {
      this.events[type].splice(position, 1);
    }
  };

  EventTarget.prototype.removeAllListeners = function (type) {
    if (arguments.length === 0) {
      this.events = {};
    } else if (typeof this.events !== "undefined" &&
               typeof this.events[type] !== "undefined") {
      this.events[type] = [];
    }
  };

  EventTarget.prototype.dispatchEvent = function (event) {
    if (typeof this.events === "undefined" ||
        typeof this.events[event.type] === "undefined") {
      return false;
    }

    var listeners = this.events[event.type].slice();
    if (!listeners.length) return false;

    for (var i = 0, length = listeners.length; i < length; i++) {
      listeners[i].call(this, event);
    }

    return true;
  };

  exports.Event = Event;

  function Event(type) {
    this.type = type;
    this.timeStamp = Date.now();
  }

  exports.ProgressEvent = ProgressEvent;

  inherits(ProgressEvent, Event);
  function ProgressEvent(type, eventInitDict) {
    Event.call(this, type);

    eventInitDict = eventInitDict || {};

    this.lengthComputable = eventInitDict.lengthComputable || false;
    this.loaded = eventInitDict.loaded || 0;
    this.total = eventInitDict.total || 0;
  }

  exports.callback = function (maybeCallback) {
    if (typeof maybeCallback !== "function") {
      return function () {};
    }
    return maybeCallback;
  };

  exports.async = function (callback) {
    if (typeof callback !== "function") {
      return callback;
    }
    return function () {
      var argsArray = arguments;
      setTimeout(function () {
        callback.apply(null, argsArray);
      }, 0);
    };
  };

  exports.ab2hex = function (buf) {
    var hex = "";
    var view = new Uint8Array(buf);
    for (var i = 0; i < view.length; i++) {
      var repr = view[i].toString(16);
      hex += (repr.length < 2 ? "0" : "") + repr;
    }
    return hex;
  };

  exports.hex2ab = function (hex) {
    var buf = new ArrayBuffer(hex.length / 2);
    var view = new Uint8Array(buf);
    for (var i = 0; i < view.length; i++) {
      view[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return buf;
  }
})(webinos.util);
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.path === "undefined") webinos.path = {};

// webinos <3 node.js
(function (exports) {
  var splitPathRe = /^(\/?)([\s\S]+\/(?!$)|\/)?((?:\.{1,2}$|[\s\S]+?)?(\.[^.\/]*)?)$/;

  function splitPath(path) {
    var result = splitPathRe.exec(path);
    return [result[1] || "", result[2] || "", result[3] || "", result[4] || ""];
  }

  function normalizeArray(parts, allowAboveRoot) {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var part = parts[i];
      if (part === ".") {
        parts.splice(i, 1);
      } else if (part === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }

    if (allowAboveRoot) {
      for (; up--;) {
        parts.unshift("..");
      }
    }

    return parts;
  }

  exports.normalize = function (path) {
    var isAbsolute = path.charAt(0) === "/"
      , trailingSlash = path.substr(-1) === "/";

    path = normalizeArray(path.split("/").filter(function (part) {
      return !!part;
    }), !isAbsolute).join("/");

    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }

    return (isAbsolute ? "/" : "") + path;
  };

  exports.join = function () {
    var paths = Array.prototype.slice.call(arguments, 0);
    return exports.normalize(paths.filter(function (path) {
      return path && typeof path === "string";
    }).join("/"));
  };

  exports.resolve = function () {
    var resolvedPath = ""
      , resolvedAbsolute = false;

    for (var i = arguments.length - 1; i >= 0 && !resolvedAbsolute; i--) {
      // TODO Use some fallback (e.g., the current working directory ..not)?
      var path = arguments[i];

      if (!path || typeof path !== "string") {
        continue;
      }

      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = path.charAt(0) === "/";
    }

    resolvedPath = normalizeArray(
      resolvedPath.split("/").filter(function (part) {
        return !!part;
      }
    ), !resolvedAbsolute).join("/");

    return ((resolvedAbsolute ? "/" : "") + resolvedPath) || ".";
  };

  exports.relative = function (from, to) {
    from = exports.resolve(from).substr(1);
    to = exports.resolve(to).substr(1);

    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== "") break;
      }

      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== "") break;
      }

      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }

    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));

    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }

    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join("/");
  };

  // webinos <3 webkit
  exports.isParentOf = function (parent, mayBeChild) {
    if (parent === "/" && mayBeChild !== "/") {
      return true;
    }

    if (parent.length > mayBeChild.length || mayBeChild.indexOf(parent) !== 0) {
      return false;
    }

    if (mayBeChild.charAt(parent.length) !== "/") {
      return false;
    }

    return true;
  };

  exports.dirname = function (path) {
    var result = splitPath(path)
      , root = result[0]
      , dir = result[1];

    if (!root && !dir) {
      return ".";
    }

    if (dir) {
      dir = dir.substr(0, dir.length - 1);
    }

    return root + dir;
  };

  exports.basename = function (path, ext) {
    var file = splitPath(path)[2];

    if (ext && file.substr(-1 * ext.length) === ext) {
      file = file.substr(0, file.length - ext.length);
    }

    return file;
  };

  exports.extname = function (path) {
    return splitPath(path)[3];
  };
})(webinos.path);
/*******************************************************************************
 * Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 Felix-Johannes Jendrusch, Fraunhofer FOKUS
 ******************************************************************************/

// [WP-608] Support write/truncate abort

if (typeof webinos === "undefined") webinos = {};
if (typeof webinos.file === "undefined") webinos.file = {};

(function (exports) {
  exports.Service = Service;
  // This inherits is specified in file API so please don't use it in your own APIs
  webinos.util.inherits(Service, globalExports.WebinosService);
  function Service(object, rpc) {
    exports.WebinosService.call(this, object);

    this.rpc = rpc;
  }
  // Register to the service discovery
  _webinos.registerServiceConstructor("http://webinos.org/api/file", Service);  

  Service.prototype.requestFileSystem = function (type, size, successCallback, errorCallback) {
    var self = this;
    var requestFileSystem = self.rpc.createRPC(self, "requestFileSystem");
    self.rpc.executeRPC(requestFileSystem, function (filesystem) {
      successCallback(new FileSystem(self, filesystem.name));
    }, errorCallback);
  };

  Service.prototype.resolveLocalFileSystemURL = function (url, successCallback, errorCallback) {
    webinos.util.async(errorCallback)(new webinos.util.CustomError("NotSupportedError"));
  };

  function FileSystem(service, name) {
    this.service = service;

    this.name = name;
    this.root = new DirectoryEntry(this, "/");
  }

  FileSystem.prototype.toJSON = function () {
    var json = { name : this.name };
    return json;
  };

  function Entry(filesystem, fullPath) {
    this.name = webinos.path.basename(fullPath);
    this.fullPath = fullPath;
    this.filesystem = filesystem;

    this.service = filesystem.service;
    this.rpc = filesystem.service.rpc;
  }

  Entry.prototype.isFile = false;
  Entry.prototype.isDirectory = false;

  Entry.prototype.getMetadata = function (successCallback, errorCallback) {
    var getMetadata = this.rpc.createRPC(this.service, "getMetadata", { entry : this });
    this.rpc.executeRPC(getMetadata, function (metadata) {
      successCallback(new Metadata(metadata));
    }, errorCallback);
  };

  Entry.prototype.moveTo = function (parent, newName, successCallback, errorCallback) {
    var self = this;
    if (self.service === parent.service) {
      var moveTo = self.rpc.createRPC(self.service, "moveTo", { source : self, parent : parent, newName : newName });
      self.rpc.executeRPC(moveTo, function (entry) {
        if (self.isDirectory) {
          successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
        } else {
          successCallback(new FileEntry(self.filesystem, entry.fullPath));
        }
      }, errorCallback);
    } else {
      var getLink = self.rpc.createRPC(self.service, "getLink", { entry : self });
      self.rpc.executeRPC(getLink, function (link) {
        var download = parent.rpc.createRPC(parent.service, "download", { link : link, parent : parent, name : newName || self.name });
        parent.rpc.executeRPC(download, function (entry) {
          var remove = self.rpc.createRPC(self.service, (self.isDirectory ? "removeRecursively" : "remove"), { entry : self });
          self.rpc.executeRPC(remove, function () {
            if (self.isDirectory) {
              successCallback(new DirectoryEntry(parent.filesystem, entry.fullPath));
            } else {
              successCallback(new FileEntry(parent.filesystem, entry.fullPath));
            }
          }, errorCallback);
        }, errorCallback);
      }, errorCallback);
    }
  };

  Entry.prototype.copyTo = function (parent, newName, successCallback, errorCallback) {
    var self = this;
    if (self.service === parent.service) {
      var copyTo = self.rpc.createRPC(self.service, "copyTo", { source : self, parent : parent, newName : newName });
      self.rpc.executeRPC(copyTo, function (entry) {
        if (self.isDirectory) {
          successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
        } else {
          successCallback(new FileEntry(self.filesystem, entry.fullPath));
        }
      }, errorCallback);
    } else {
      var getLink = self.rpc.createRPC(self.service, "getLink", { entry : self });
      self.rpc.executeRPC(getLink, function (link) {
        var download = parent.rpc.createRPC(parent.service, "download", { link : link, parent : parent, name : newName || self.name });
        parent.rpc.executeRPC(download, function (entry) {
          if (self.isDirectory) {
            successCallback(new DirectoryEntry(parent.filesystem, entry.fullPath));
          } else {
            successCallback(new FileEntry(parent.filesystem, entry.fullPath));
          }
        }, errorCallback);
      }, errorCallback);
    }
  };

  Entry.prototype.toURL = function () {
    throw new webinos.util.CustomError("NotSupportedError");
  };

  Entry.prototype.remove = function (successCallback, errorCallback) {
    var remove = this.rpc.createRPC(this.service, "remove", { entry : this });
    this.rpc.executeRPC(remove, successCallback, errorCallback);
  };

  Entry.prototype.getParent = function (successCallback, errorCallback) {
    var self = this;
    var getParent = self.rpc.createRPC(self.service, "getParent", { entry : self });
    self.rpc.executeRPC(getParent, function (entry) {
      successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  Entry.prototype.toJSON = function () {
    var json =
      { name        : this.name
      , fullPath    : this.fullPath
      , filesystem  : this.filesystem
      , isFile      : this.isFile
      , isDirectory : this.isDirectory
      };
    return json;
  };

  function Metadata(metadata) {
    this.modificationTime = new Date(metadata.modificationTime);
    this.size = metadata.size;
  }

  webinos.util.inherits(DirectoryEntry, Entry);
  function DirectoryEntry(filesystem, fullPath) {
    Entry.call(this, filesystem, fullPath);
  }

  DirectoryEntry.prototype.isDirectory = true;

  DirectoryEntry.prototype.createReader = function () {
    return new DirectoryReader(this);
  };

  DirectoryEntry.prototype.getFile = function (path, options, successCallback, errorCallback) {
    var self = this;
    var getFile = self.rpc.createRPC(self.service, "getFile", { entry : self, path : path, options : options });
    self.rpc.executeRPC(getFile, function (entry) {
      successCallback(new FileEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  DirectoryEntry.prototype.getDirectory = function (path, options, successCallback, errorCallback) {
    var self = this;
    var getDirectory = self.rpc.createRPC(self.service, "getDirectory", { entry : self, path : path, options : options });
    self.rpc.executeRPC(getDirectory, function (entry) {
      successCallback(new DirectoryEntry(self.filesystem, entry.fullPath));
    }, errorCallback);
  };

  DirectoryEntry.prototype.removeRecursively = function (successCallback, errorCallback) {
    var removeRecursively = this.rpc.createRPC(this.service, "removeRecursively", { entry : this });
    this.rpc.executeRPC(removeRecursively, successCallback, errorCallback);
  };

  function DirectoryReader(entry) {
    this.entry = entry;

    this.service = entry.filesystem.service;
    this.rpc = entry.filesystem.service.rpc;
  }

  DirectoryReader.prototype.readEntries = function (successCallback, errorCallback) {
    var self = this;

    function next() {
      if (!self.entries.length) return [];

      var chunk = self.entries.slice(0, 10);
      self.entries.splice(0, 10);
      return chunk;
    }

    if (typeof self.entries === "undefined") {
      var readEntries = self.rpc.createRPC(self.service, "readEntries", { entry : self.entry });
      self.rpc.executeRPC(readEntries, function (entries) {
        self.entries = entries.map(function (entry) {
          if (entry.isDirectory) {
            return new DirectoryEntry(self.entry.filesystem, entry.fullPath);
          } else {
            return new FileEntry(self.entry.filesystem, entry.fullPath);
          }
        });

        successCallback(next());
      }, errorCallback);
    } else webinos.util.async(successCallback)(next());
  };

  webinos.util.inherits(FileEntry, Entry);
  function FileEntry(filesystem, fullPath) {
    Entry.call(this, filesystem, fullPath);
  }

  FileEntry.prototype.isFile = true;

  FileEntry.prototype.getLink = function (successCallback, errorCallback) {
    var getLink = this.rpc.createRPC(this.service, "getLink", { entry : this });
    this.rpc.executeRPC(getLink, successCallback, errorCallback);
  };

  FileEntry.prototype.createWriter = function (successCallback, errorCallback) {
    var self = this;
    var getMetadata = self.rpc.createRPC(self.service, "getMetadata", { entry : self });
    self.rpc.executeRPC(getMetadata, function (metadata) {
      var writer = new FileWriter(self);
      writer.length = metadata.size;

      successCallback(writer);
    }, errorCallback);
  };

  FileEntry.prototype.file = function (successCallback, errorCallback) {
    var self = this;
    var getMetadata = self.rpc.createRPC(self.service, "getMetadata", { entry : self });
    self.rpc.executeRPC(getMetadata, function (metadata) {
      var blobParts = [];

      var remote;
      var port = self.rpc.createRPC(self.service, "read",
         { entry : self
         , options : { bufferSize : 16 * 1024, autopause : true }
         });
      port.ref = function (params, successCallback, errorCallback, ref) {
        remote = ref;
      };
      port.open = function () {};
      port.data = function (params) {
        blobParts.push(webinos.util.hex2ab(params.data));

        var resume = self.rpc.createRPC(remote, "resume", null);
        self.rpc.executeRPC(resume);
      };
      port.end = function () {};
      port.close = function () {
        try {
          var blob = new Blob(blobParts);
          blob.name = self.name;
          blob.lastModifiedDate = new Date(metadata.modificationTime);

          successCallback(blob);
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      };
      port.error = function (params) {
        try {
          errorCallback(params.error);
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      };

      self.rpc.registerCallbackObject(port);
      self.rpc.executeRPC(port);
    }, errorCallback);
  };

  webinos.util.inherits(FileWriter, webinos.util.EventTarget);
  function FileWriter(entry) {
    webinos.util.EventTarget.call(this);

    this.entry = entry;

    this.readyState = FileWriter.INIT;
    this.length = 0;
    this.position = 0;

    this.service = entry.filesystem.service;
    this.rpc = entry.filesystem.service.rpc;

    this.addEventListener("writestart", function (event) {
      webinos.util.callback(this.onwritestart)(event);
    });
    this.addEventListener("progress", function (event) {
      webinos.util.callback(this.onprogress)(event);
    });
    this.addEventListener("abort", function (event) {
      webinos.util.callback(this.onabort)(event);
    });
    this.addEventListener("write", function (event) {
      webinos.util.callback(this.onwrite)(event);
    });
    this.addEventListener("writeend", function (event) {
      webinos.util.callback(this.onwriteend)(event);
    });
    this.addEventListener("error", function (event) {
      webinos.util.callback(this.onerror)(event);
    });
  }

  FileWriter.INIT = 0;
  FileWriter.WRITING = 1;
  FileWriter.DONE = 2;

  function BlobIterator(blob) {
    this.blob = blob;
    this.position = 0;
  }

  BlobIterator.prototype.hasNext = function () {
    return this.position < this.blob.size;
  };

  BlobIterator.prototype.next = function () {
    if (!this.hasNext()) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    var end = Math.min(this.position + 16 * 1024, this.blob.size);
    var chunk;
    if (this.blob.slice) {
      chunk = this.blob.slice(this.position, end);
    } else if (this.blob.webkitSlice) {
      chunk = this.blob.webkitSlice(this.position, end);
    } else if (this.blob.mozSlice) {
      chunk = this.blob.mozSlice(this.position, end);
    }
    this.position = end;
    return chunk;
  };

  FileWriter.prototype.write = function (data) {
    var self = this;

    if (self.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    self.readyState = FileWriter.WRITING;
    self.dispatchEvent(new webinos.util.ProgressEvent("writestart"));

    var reader = new FileReader();
    // reader.onloadstart = function (event) {};
    // reader.onprogress = function (event) {};
    // reader.onabort = function (event) {};
    reader.onload = function () {
      var write = self.rpc.createRPC(remote, "write", { data : webinos.util.ab2hex(reader.result) });
      self.rpc.executeRPC(write, function (bytesWritten) {
        self.position += bytesWritten;
        self.length = Math.max(self.position, self.length);

        self.dispatchEvent(new webinos.util.ProgressEvent("progress"));
      });
    };
    // reader.onloadend = function (event) {};
    reader.onerror = function () {
      var destroy = self.rpc.createRPC(remote, "destroy");
      self.rpc.executeRPC(destroy, function () {
        try {
          self.error = reader.error;
          self.readyState = FileWriter.DONE;
          self.dispatchEvent(new webinos.util.ProgressEvent("error"));
          self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
        } finally {
          self.rpc.unregisterCallbackObject(port);
        }
      });
    };

    var iterator = new BlobIterator(data);
    function iterate() {
      if (iterator.hasNext()) {
        reader.readAsArrayBuffer(iterator.next());
      } else {
        var end = self.rpc.createRPC(remote, "end");
        self.rpc.executeRPC(end, function () {
          try {
            self.readyState = FileWriter.DONE;
            self.dispatchEvent(new webinos.util.ProgressEvent("write"));
            self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
          } finally {
            self.rpc.unregisterCallbackObject(port);
          }
        });
      }
    }

    var remote;
    var port = self.rpc.createRPC(self.service, "write",
       { entry : self.entry
       , options : { start : self.position }
       });
    port.ref = function (params, successCallback, errorCallback, ref) {
      remote = ref;
    };
    port.open = function () {
      iterate();
    };
    port.drain = function () {
      iterate();
    };
    port.close = function () {};
    port.error = function (params) {
      try {
        self.error = params.error;
        self.readyState = FileWriter.DONE;
        self.dispatchEvent(new webinos.util.ProgressEvent("error"));
        self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
      } finally {
        reader.abort();

        self.rpc.unregisterCallbackObject(port);
      }
    };

    self.rpc.registerCallbackObject(port);
    self.rpc.executeRPC(port);
  };

  FileWriter.prototype.seek = function (offset) {
    if (this.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    this.position = offset;

    if (this.position > this.length) {
      this.position = this.length;
    }

    if (this.position < 0) {
      this.position = this.position + this.length;
    }

    if (this.position < 0) {
      this.position = 0;
    }
  };

  FileWriter.prototype.truncate = function (size) {
    var self = this;

    if (self.readyState === FileWriter.WRITING) {
      throw new webinos.util.CustomError("InvalidStateError");
    }

    self.readyState = FileWriter.WRITING;
    self.dispatchEvent(new webinos.util.ProgressEvent("writestart"));

    var truncate = self.rpc.createRPC(self.service, "truncate", { entry : self.entry, size : size });
    self.rpc.executeRPC(truncate, function () {
      self.length = size;
      self.position = Math.min(self.position, size);

      self.readyState = FileWriter.DONE;
      self.dispatchEvent(new webinos.util.ProgressEvent("write"));
      self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
    }, function (error) {
      self.error = error;
      self.readyState = FileWriter.DONE;
      self.dispatchEvent(new webinos.util.ProgressEvent("error"));
      self.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
    });
  };

  // FileWriter.prototype.abort = function () {
  //   if (this.readyState === FileWriter.DONE ||
  //       this.readyState === FileWriter.INIT) return;

  //   this.readyState = FileWriter.DONE;

  //   // If there are any tasks from the object's FileSaver task source in one of
  //   // the task queues, then remove those tasks.
  //   // Terminate the write algorithm being processed.

  //   this.error = new webinos.util.CustomError("AbortError");
  //   this.dispatchEvent(new webinos.util.ProgressEvent("abort"));
  //   this.dispatchEvent(new webinos.util.ProgressEvent("writeend"));
  // };
})(webinos.file);
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
******************************************************************************/
(function() {

/**
 * Webinos Geolocation service constructor (client side).
 * @constructor
 * @param obj Object containing displayName, api, etc.
 */
WebinosGeolocation = function (obj) {
  exports.WebinosService.call(this, obj);
};
// Inherit all functions from WebinosService
WebinosGeolocation.prototype = Object.create(exports.WebinosService.prototype);
// The following allows the 'instanceof' to work properly
WebinosGeolocation.prototype.constructor = WebinosGeolocation;
// Register to the service discovery
_webinos.registerServiceConstructor("http://webinos.org/api/w3c/geolocation", WebinosGeolocation);
// If you want to enable the old URI, uncomment the following line
//_webinos.registerServiceConstructor("http://www.w3.org/ns/api-perms/geolocation", WebinosGeolocation);

/**
 * To bind the service.
 * @param bindCB BindCallback object.
 */
WebinosGeolocation.prototype.bindService = function (bindCB, serviceId) {
	// actually there should be an auth check here or whatever, but we just always bind
	this.getCurrentPosition = getCurrentPosition;
	this.watchPosition = watchPosition;
	this.clearWatch = clearWatch;
	
	if (typeof bindCB.onBind === 'function') {
		bindCB.onBind(this);
	};
}

/**
 * Retrieve the current position.
 * @param positionCB Success callback.
 * @param positionErrorCB Error callback.
 * @param positionOptions Optional options.
 */
function getCurrentPosition(positionCB, positionErrorCB, positionOptions) { 
	var rpc = webinos.rpcHandler.createRPC(this, "getCurrentPosition", positionOptions); // RPC service name, function, position options
	webinos.rpcHandler.executeRPC(rpc, function (position) {
		positionCB(position);
	},
	function (error) {
		positionErrorCB(error);
	});
};

var watchIdTable = {};

/**
 * Register a listener for position updates.
 * @param positionCB Callback for position updates.
 * @param positionErrorCB Error callback.
 * @param positionOptions Optional options.
 * @returns Registered listener id.
 */
function watchPosition(positionCB, positionErrorCB, positionOptions) {
	var rpc = webinos.rpcHandler.createRPC(this, "watchPosition", [positionOptions]);

	rpc.onEvent = function (position) {
		positionCB(position);
	};

	rpc.onError = function (err) {
		positionErrorCB(err);
	};

	webinos.rpcHandler.registerCallbackObject(rpc);
	webinos.rpcHandler.executeRPC(rpc);

	var watchId = parseInt(rpc.id, 16);
	watchIdTable[watchId] = rpc.id;

	return watchId;
};

/**
 * Clear a listener.
 * @param watchId The id as returned by watchPosition to clear.
 */
function clearWatch(watchId) {
	var _watchId = watchIdTable[watchId];
	if (!_watchId) return;

	var rpc = webinos.rpcHandler.createRPC(this, "clearWatch", [_watchId]);
	webinos.rpcHandler.executeRPC(rpc);

	delete watchIdTable[watchId];
	webinos.rpcHandler.unregisterCallbackObject({api:_watchId});
};

})();
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*
* Author: Giuseppe La Torre (giuseppe.latorre@dieei.unict.it)
* Author: Stefano Vercelli (stefano.vercelli@telecomitalia.it)
* 
******************************************************************************/

(function() {

    var sensorListeners = new Array();

    /**
     * Webinos Sensor service constructor (client side).
     * @constructor
     * @param obj Object containing displayName, api, etc.
     */
    Sensor = function(obj) {
      exports.WebinosService.call(this, obj);
    };
    // Inherit all functions from WebinosService
    Sensor.prototype = Object.create(exports.WebinosService.prototype);
    // The following allows the 'instanceof' to work properly
    Sensor.prototype.constructor = Sensor;
    // Register to the service discovery
    _webinos.registerServiceConstructor("http://webinos.org/api/sensors", Sensor);
    
    /**
     * To bind the service.
     * @param bindCB BindCallback object.
     */
    Sensor.prototype.bind = function(bindCB) {
        var self = this;
        var rpc = webinos.rpcHandler.createRPC(this, "getStaticData", []);
        
        webinos.rpcHandler.executeRPC(rpc,
            function (result){
            
                self.maximumRange = result.maximumRange;
                self.minDelay = result.minDelay;
                self.power = result.power;
                self.resolution = result.resolution;
                self.vendor = result.vendor;  
                self.version = result.version; 
            
                if (typeof bindCB.onBind === 'function') {
                    bindCB.onBind(self);
                };
            },
            function (error){
                
            }
        );
    };

    Sensor.prototype.bindService = function(bindCB) {
        this.bind(bindCB);
    };
    
    Sensor.prototype.configureSensor = function(params, successHandler, errorHandler){
        var rpc = webinos.rpcHandler.createRPC(this, 'configureSensor', params);
        webinos.rpcHandler.executeRPC(rpc, function () {
                successHandler();
            },
            function (error) {
                errorHandler(error);
            });
    };

    Sensor.prototype.addEventListener = function(eventType, eventHandler, capture) {
        var rpc = webinos.rpcHandler.createRPC(this, "addEventListener", eventType);
        sensorListeners.push([rpc.id, eventHandler, this.id]);
        rpc.onEvent = function (sensorEvent) {
            eventHandler(sensorEvent);
        };
        webinos.rpcHandler.registerCallbackObject(rpc);
        webinos.rpcHandler.executeRPC(rpc);
    };

    Sensor.prototype.removeEventListener = function(eventType, eventHandler, capture) {
        for (var i = 0; i < sensorListeners.length; i++) {
            if (sensorListeners[i][1].toString().replace(/ /g,'') === eventHandler.toString().replace(/ /g,'') && sensorListeners[i][2] == this.id) {
                var arguments = new Array();
                arguments[0] = sensorListeners[i][0];
                arguments[1] = eventType;
                var rpc = webinos.rpcHandler.createRPC(this, "removeEventListener", arguments);
                webinos.rpcHandler.executeRPC(rpc);
                sensorListeners.splice(i,1);
                break;
            }
        }
    };
}());


(function() {

    var actuatorListeners = new Array();
    
    /**
     * Webinos Actuator service constructor (client side).
     * @constructor
     * @param obj Object containing displayName, api, etc.
     */
    ActuatorModule = function(obj) {
      exports.WebinosService.call(this, obj);
    };
    // Inherit all functions from WebinosService
    ActuatorModule.prototype = Object.create(exports.WebinosService.prototype);
    // The following allows the 'instanceof' to work properly
    ActuatorModule.prototype.constructor = ActuatorModule;
    // Register to the service discovery
    _webinos.registerServiceConstructor("http://webinos.org/api/actuators", ActuatorModule);

    /**
     * To bind the service.
     * @param bindCB BindCallback object.
     */
    ActuatorModule.prototype.bind = function(bindCB) {
            var self = this;
            var rpc = webinos.rpcHandler.createRPC(this, "getStaticData", []);
            webinos.rpcHandler.executeRPC(rpc,
                function (result){
            
                    self.range = result.range;
                    self.unit = result.unit;
                    self.vendor = result.vendor;
                    self.version = result.version;
                    if (typeof bindCB.onBind === 'function') {
                        bindCB.onBind(self);
                    }
                },
                function (error){
                    
                }
            );
    };

    ActuatorModule.prototype.bindService = function(bindCB) {
        this.bind(bindCB);
    };
    
    /**
     * Sets a value on the actuator
     * @param successCB Success callback.
     * @param errorCallback Error callback.
     * @param value The value to set to the actuator.
    */
    ActuatorModule.prototype.setValue = function (value, successCB, errorCallback){
        var rpc = webinos.rpcHandler.createRPC(this, "setValue", value);        
        rpc.onEvent = function (actuatorEvent) {
            successCB(actuatorEvent);
        };
        webinos.rpcHandler.registerCallbackObject(rpc);
        webinos.rpcHandler.executeRPC(rpc);        
    };
    
    ActuatorModule.prototype.addEventListener = function(eventType, eventHandler, capture) {
        var rpc = webinos.rpcHandler.createRPC(this, "addEventListener", eventType);
        actuatorListeners.push([rpc.id, eventHandler, this.id]);
        rpc.onEvent = function (actuatorEvent) {
            eventHandler(actuatorEvent);
        };
        webinos.rpcHandler.registerCallbackObject(rpc);
        webinos.rpcHandler.executeRPC(rpc);
    };

    ActuatorModule.prototype.removeEventListener = function(eventType, eventHandler, capture) {
        for (var i = 0; i < actuatorListeners.length; i++) {
            if (actuatorListeners[i][1] == eventHandler && actuatorListeners[i][2] == this.id) {
                var arguments = new Array();
                arguments[0] = actuatorListeners[i][0];
                arguments[1] = eventType;
                var rpc = webinos.rpcHandler.createRPC(this, "removeEventListener", arguments);
                webinos.rpcHandler.executeRPC(rpc);
                actuatorListeners.splice(i,1);
                break;
            }
        }
    };
}());

/*******************************************************************************
 *  Code contributed to the webinos project
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *  
 *     http://www.apache.org/licenses/LICENSE-2.0
 *  
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * Copyright 2013 Sony Mobile Communications
 * 
 ******************************************************************************/

(function() {

    var ListenerType = {
        TEXT : 0,
        URI : 1,
        MIME : 2
    };

    function ListenerWrapper(type, extra, listener, rpc) {
        this.type = type;
        this.extra = extra;
        this.listener = listener;
        this.rpc = rpc;
    }

    NfcModule = function(obj) {
      exports.WebinosService.call(this, obj);

        this.listeners = {};
        
        this.currentTag = null;
    };
    // Inherit all functions from WebinosService
    NfcModule.prototype = Object.create(exports.WebinosService.prototype);
    // The following allows the 'instanceof' to work properly
    NfcModule.prototype.constructor = NfcModule;
    // Register to the service discovery
    _webinos.registerServiceConstructor("http://webinos.org/api/nfc", NfcModule);

    NfcModule.prototype.bindService = function(bindCB, serviceId) {
        this.textRecord = textRecord;
        this.uriRecord = uriRecord;
        this.mimeRecord = mimeRecord;
        this.addTextTypeListener = addTextTypeListener;
        this.addUriTypeListener = addUriTypeListener;
        this.addMimeTypeListener = addMimeTypeListener;
        this.removeTextTypeListener = removeTextTypeListener;
        this.removeUriTypeListener = removeUriTypeListener;
        this.removeMimeTypeListener = removeMimeTypeListener;
        this.shareTag = shareTag;
        this.unshareTag = unshareTag;
        this.launchScanningUI = launchScanningUI;
        this.dispatchEvent = dispatchEvent;
        if (typeof bindCB.onBind === 'function') {
            bindCB.onBind(this);
        }
    };

    string2byteArray = function(str) {
        var ba = [];
        for ( var i = 0; i < str.length; i++) {
            ba[i] = str.charCodeAt(i);
        }
        return ba;
    };
    
    NdefRecord = function(id, TNF, type, payload, info) {
      this.id = id;
      this.TNF = TNF;
      this.type = type;
      this.payload = payload;
      this.info = info;
    };
    
    function textRecord(text, lang) {
        var textBytes  = string2byteArray(text);
        var langBytes  = string2byteArray(lang);
        var payload = [];
        
        payload.push(langBytes.length);

        payload = payload.concat(langBytes);
        payload = payload.concat(textBytes);
        
        return new NdefRecord("", 1, "T", payload, text);  
    }

    function uriRecord(uri) {
        var uriBytes  = string2byteArray(uri);
        var payload = [];
        
        payload.push(0);
        
        payload = payload.concat(uriBytes);
        
        return new NdefRecord("", 1, "U", payload, uri);  
    }

    function mimeRecord(mimeType, data) {
        return new NdefRecord("", 2, mimeType, data, data);
    }
    

    function findListener(nfcModule, type, extra, listener) {
        for ( var handle in nfcModule.listeners) {
            var listenerWrapper = nfcModule.listeners[handle];
            if (listenerWrapper.type == type
                    && (extra != null || extra == listenerWrapper.extra)
                    && listenerWrapper.listener == listener) {
                return handle;
            }
        }
        return null;
    }
    

    function addListener(nfcModule, type, extra, listener, success, fail) {
        if (findListener(nfcModule, type, extra, listener) != null) {
            if(typeof fail !== "undefined") {
                fail("listener is already registered");
            }
        } else {
            var rpc;
            if (type == ListenerType.TEXT) {
                rpc = webinos.rpcHandler.createRPC(nfcModule,
                        "addTextTypeListener");
            } else if (type == ListenerType.URI) {
                rpc = webinos.rpcHandler.createRPC(nfcModule,
                        "addUriTypeListener", [ extra ]);
            } else if (type == ListenerType.MIME) {
                rpc = webinos.rpcHandler.createRPC(nfcModule,
                        "addMimeTypeListener", [ extra ]);
            }

            rpc.onEvent = function(tag) {
                
                tag.read = function(success, fail) {
                    if (this != nfcModule.currentTag) {
                        fail("invalid tag");
                    }
                    var rpc = webinos.rpcHandler.createRPC(nfcModule,
                            "read");
                    webinos.rpcHandler.executeRPC(rpc, function(params) {                       
                        if (typeof success !== 'undefined') {
                            success(params);
                        }
                    }, function(error) {
                        if (typeof fail !== 'undefined') {
                            fail();
                        }
                    });
                }
                
                tag.write = function(ndefmessage, success, fail) {
                    if (this != nfcModule.currentTag) {
                        fail("invalid tag");
                    }
                    var rpc = webinos.rpcHandler.createRPC(nfcModule,
                            "write", [ ndefmessage ]);
                    webinos.rpcHandler.executeRPC(rpc, function(params) {                       
                        if (typeof success !== 'undefined') {
                            success();
                        }
                    }, function(error) {
                        if (typeof fail !== 'undefined') {
                            fail();
                        }
                    });
                }
                
                tag.close = function(fail) {
                    if (this != nfcModule.currentTag) {
                        fail("invalid tag");
                    }
                    var rpc = webinos.rpcHandler.createRPC(nfcModule, "close");
                    webinos.rpcHandler.executeRPC(rpc, null, function(error) {
                        if (typeof fail !== 'undefined') {
                            fail();
                        }
                    });
                }               
                
                nfcModule.currentTag = tag;
                listener(tag);
            };

            webinos.rpcHandler.registerCallbackObject(rpc);

            webinos.rpcHandler.executeRPC(rpc, function(params) {
                nfcModule.listeners[params] = new ListenerWrapper(type, extra,
                        listener, rpc);
                if (typeof success !== 'undefined') {
                    success();
                }
            }, function(error) {
                webinos.rpcHandler.unregisterCallbackObject(rpc);
                if (typeof fail !== 'undefined') {
                    fail();
                }
            });
        }
    }

    function addTextTypeListener(listener, success, fail) {
        addListener(this, ListenerType.TEXT, null, listener, success, fail);
    }

    function addUriTypeListener(scheme, listener, success, fail) {
        addListener(this, ListenerType.URI, scheme, listener, success, fail);
    }

    function addMimeTypeListener(mimeType, listener, success, fail) {
        addListener(this, ListenerType.MIME, mimeType, listener, success, fail);
    }

    function removeListener(nfcModule, type, extra, listener) {
        var handle = findListener(nfcModule, type, extra, listener);
        if (handle != null) {
            var rpc = webinos.rpcHandler.createRPC(nfcModule, "removeListener",
                    [ handle ]);
            webinos.rpcHandler.executeRPC(rpc);
            webinos.rpcHandler.unregisterCallbackObject(nfcModule.listeners[handle].rpc);
            delete nfcModule.listeners[handle];
        }
    }

    function removeTextTypeListener(listener) {
        removeListener(this, ListenerType.TEXT, null, listener);
    }

    function removeUriTypeListener(scheme, listener) {
        removeListener(this, ListenerType.URI, scheme, listener);
    }

    function removeMimeTypeListener(mimeType, listener) {
        removeListener(this, ListenerType.MIME, mimeType, listener);
    }
    

    function shareTag(message, success, fail) {
        var rpc = webinos.rpcHandler.createRPC(this, "shareTag",
                [ message ]);
        webinos.rpcHandler.executeRPC(rpc, function() {
            if (typeof success !== 'undefined') {
                success();
            }
        }, function(err) {
            if (typeof fail !== 'undefined') {
                fail();
            }
        });
    }
    
    function unshareTag(success, fail) {
        var rpc = webinos.rpcHandler.createRPC(this, "unshareTag");
        webinos.rpcHandler.executeRPC(rpc, function() {
            if (typeof success !== 'undefined') {
                success();
            }
        }, function(err) {
            if (typeof fail !== 'undefined') {
                fail();
            }
        });
    }
    
    function launchScanningUI(autoDismiss, success, fail) {
        var rpc = webinos.rpcHandler.createRPC(this, "launchScanningUI",
                [ autoDismiss ]);
        webinos.rpcHandler.executeRPC(rpc, function() {
            if (typeof success !== 'undefined') {
                success();
            }
        }, function(err) {
            if (typeof fail !== 'undefined') {
                fail();
            }
        });
    }

    function dispatchEvent(event) {
        var rpc = webinos.rpcHandler.createRPC(this, "dispatchEvent", [ event ]);
        webinos.rpcHandler.executeRPC(rpc);
    }

}());
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 ******************************************************************************/
(function() {

	PolicyManagementModule = function(obj) {
    exports.WebinosService.call(this, obj);
	};
	
	// Inherit all functions from WebinosService
	PolicyManagementModule.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	PolicyManagementModule.prototype.constructor = PolicyManagementModule;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/core/policymanagement", PolicyManagementModule);


    PolicyManagementModule.prototype.bindService = function (bindCB, serviceId) {
        this.policy = policy;
        this.policyset = policyset;
        this.getPolicySet = getPolicySet;
        this.testPolicy = testPolicy;
        this.testNewPolicy = testNewPolicy;
        this.save = save;

        if (typeof bindCB.onBind === 'function') {
            bindCB.onBind(this);
        };
    }


    var policy = function(ps, id, combine, description){

        var _ps = ps;
        if(ps)
            _ps = ps;
        else{
            _ps = {};
            _ps['$'] = {};
            _ps['$']["id"] = (id) ? id : getNewId();
        }

        if(combine)
            _ps['$']["combine"] = combine;
        if(description)
            _ps['$']["description"] = description;

        function getNewId(type) {
            return new Date().getTime();
        };

        this.getInternalPolicy = function(){
            return _ps;
        };

        //this.updateRule = function(ruleId, effect, updatedCondition){
        this.updateRule = function(ruleId, key, value){
            if(!_ps) {
                return null;
            }

//            if(effect != 'permit' && effect != 'prompt-oneshot' && effect != 'prompt-session' && effect != 'prompt-blanket' && effect != 'deny') {
//                effect = "";
//            }

            //console.log("Effect :: "+effect);
            var policy = _ps;
            var rule;
            var count=0;
            for(var i in policy["rule"]) {
                if(policy["rule"][i]['$']["id"] == ruleId) {
                    rule = policy["rule"][i];
                    break;
                }
                count++;
            }

            if(rule){


                if(key == "effect"){
                    if(value)
                        rule['$']["effect"] = value;
                    else
                        rule['$']["effect"] = "permit";
                }
                else if(key == "condition"){

                    if(value){
                        if(rule.condition){
                            //check first child
                            var parent = rule["condition"];

                            var tmp = parent[0];
                            console.log(JSON.stringify(rule["condition"]));
                            if(tmp['$']["id"] == value['$']["id"]){
                                parent[0] = value;
                                return;
                            }

                            //check other children
                            while(true){
                                if(tmp.condition && value){

                                    if(tmp.condition[0]['$']["id"] == value['$']["id"]){
                                        tmp.condition[0] = value;
                                        return;
                                    }
                                    else
                                        tmp = tmp.condition;
                                }
                                else
                                    break;
                            }
                        }
                        else{
                            rule["condition"] = [value];
                        }
                    }
                    else{
                        if(rule.condition){
                            rule.condition = undefined;
                        }
                        else
                        {
                            ;
                        }
                    }
                }
/*
                if(!updatedCondition)
                    if(rule["condition"])
                        rule["condition"] = undefined;

                else if(!rule.condition){
                    console.log("No condition");
                    rule["condition"] = new Array();
                    rule["condition"][0] = updatedCondition;
                }

                else{

                    //check first child
                    var parent = rule["condition"];

                    var tmp = parent[0];

                    if(tmp['$']["id"] == updatedCondition['$']["id"]){
                        parent[0] = updatedCondition;
                        return;
                    }

                    //check other children
                    while(true){
                        if(tmp.condition && updatedCondition){
                            if(tmp.condition[0]['$']["id"] == updatedCondition['$']["id"]){
                                tmp.condition[0] = updatedCondition;
                                return;
                            }
                            else
                                tmp = tmp.condition;
                        }
                        else
                            break;
                    }
                }*/
            }
        }

        this.addRule = function(newRuleId, effect, newCondition, rulePosition){
            if(!_ps) {
                return null;
            }

            //Check if effect is valid value (deny is included in default rule)
            if(effect != 'permit' && effect != 'prompt-oneshot' && effect != 'prompt-session' && effect != 'prompt-blanket' && effect != 'deny') {
                effect = "permit";
            }

            //console.log("Effect :: "+effect);
            var policy = _ps;

            var rule;
            for(var i in policy['rule']) {
                if(policy['rule'][i]['$']['effect'] == effect) {
                    rule = policy['rule'][i];
                    break;
                }
            }
            //console.log("rule :: "+rule);

            if(!rule){
                var id = (newRuleId) ? newRuleId : new Date().getTime();
                rule = {"$": {"id" : id, "effect" : effect}};
                var position = 0;
                if(rulePosition && (rulePosition<0 || policy["rule"].length == 0))
                    policy["rule"].length;
                if(!rulePosition && policy["rule"])
                    position = policy["rule"].length;

                console.log("position : "+position);
                if(!policy["rule"])
                    policy["rule"] = [rule];
                else
                    policy["rule"].splice(position, 0, rule);
            }

            if(newCondition){
                if(!rule.condition){
                    console.log("No condition");
                    rule["condition"] = [newCondition];
                }
                else{
                    var tmp = rule["condition"][0];
                    while(true){
                        if(tmp.condition){
                            tmp = tmp.condition[0];
                        }
                        else
                            break;
                    }

                    tmp["condition"] = [newCondition];
                }
            }
        };

        this.removeRule = function(ruleId) {
            if(!_ps) {
                return null;
            }
            if(ruleId == null) {
                return null;
            }

            var policy = _ps;

            //console.log("PRE : " + JSON.stringify(policy["rule"]));
            if(policy["rule"]){
                var index = -1;
                var count = 0;

                for(var i in policy["rule"]){
                    if(policy["rule"][i]["$"]["id"] && policy["rule"][i]["$"]["id"] == ruleId){
                        index = i;
                        //break;
                    }
                    count ++;
                }
                if(index != -1){
                    console.log("Removing rule " + index);
                    policy["rule"].splice(index,1);
                    if(count == 1)
                        policy["rule"] = undefined;
                }


            }
            else
                console.log("No rules");
        };

        this.addSubject = function(newSubjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            var id = (newSubjectId) ? newSubjectId : new Date().getTime();
            var newsubj = {"$" : {"id" : id} , "subject-match" : [] };

            for(var i in matches){
                if(i == "subject-match")
                    newsubj["subject-match"].push(matches[i]);
            }

            if(!policy.target)
                policy.target = [{}];
            if(!policy.target[0]["subject"])
                policy.target[0]["subject"] = [];

            //console.log(JSON.stringify(policy.target[0]));
            for(var i =0; i<policy.target[0]["subject"].length; i++){
                    if(policy.target[0]["subject"][i]['$']["id"] == newSubjectId){
                        console.log("A subject with " + newSubjectId + " is already present");
                        return;
                    }
                }
            policy.target[0]["subject"].push(newsubj);
            //console.log(JSON.stringify(policy.target[0]));

        };
/*
        this.getSubjects = function(policyId){
            if(!_ps) {
                return null;
            }

            var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;

            if(policy == null) {
                return null;
            }
            var subjects = policy.target[0]["subject"];

            return subjects;
        };*/

        this.removeSubject = function(subjectId) {
            if(!_ps) {
                return null;
            }
            /*
            if(policyId == null) {
                return;
            }*/

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            var count = 0;

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        //break;
                    }
                    count++;
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                }
                if(count == 1)
                    //policy.target = [];
                    policy.target = undefined;
            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };

        this.updateSubject = function(subjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }
            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var subjects = policy.target[0]["subject"];
                for(var i in subjects){
                    if(subjects[i]['$']["id"] == subjectId)
                        subjects[i]["subject-match"] = matches["subject-match"];
                }
            }
        };

        this.updateAttribute = function(key, value){
            if (!key) {
                return;
            }
            if (key == "combine") {
                _ps['$']["combine"] = value;
            }
            else if (key == "description") {
                _ps['$']["description"] = value;
            }

        };

        this.toJSONObject = function(){
            return _ps;
        };
    };

    var policyset = function(ps ,type, basefile, fileId, id, combine, description) {
        var _type = type;
        var _basefile = basefile;
        var _fileId = fileId;

        var _parent;

        //var id = (newSubjectId) ? newSubjectId : new Date().getTime();
        var _ps = ps;
        if(ps)
            _ps = ps;
        else{
            _ps = {};
            _ps['$'] = {};
            _ps['$']["id"] = (id) ? id : getNewId();
        }

        if(combine)
            _ps['$']["combine"] = combine;
        if(description)
            _ps['$']["description"] = description;

        this.getBaseFile = function(){
            return _basefile;
        };

        this.getFileId = function(){
            return _fileId;
        };

        function getNewId(type) {
            return new Date().getTime();
        }

        function getPolicyById(policySet, policyId) {
            //console.log('getPolicyById - policySet is '+JSON.stringify(policySet));
            /*
            if(policyId == null || (policySet['$']['id'] && policySet['$']['id'] == policyId)) {
                return policySet;
            }
            */
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    if(policySet['policy'][j]['$']['id'] == policyId) {
                        return policySet['policy'][j];
                    }
                }
            }
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        return policySet['policy-set'][j];
                    }
                    var tmp = getPolicyById(policySet['policy-set'][j], policyId);
                    if(tmp != null) {
                        return tmp;
                    }
                }
            }
            return null;
        };

        function getPolicySetById(policySet, policyId) {
            //console.log('getPolicyById - policySet is '+JSON.stringify(policySet));

            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        return policySet['policy-set'][j];
                    }
                    var tmp = getPolicyById(policySet['policy-set'][j], policyId);
                    if(tmp != null) {
                        return tmp;
                    }
                }
            }
            return null;
        };

        function getPolicySetBySubject(policySet, subject) {
            var res = {'generic':[], 'matched':[]};
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    var checkRes = checkPolicySetSubject(policySet['policy-set'][j] , subject);
                    if (checkRes == 0){
                        res['generic'].push(new policyset(policySet['policy-set'][j], "policy-set"));
                    } else if (checkRes == 1){
                        res['matched'].push(new policyset(policySet['policy-set'][j], "policy-set"));
                    }
                    if (policySet['policy-set'][j]['policy-set']){
                        var tmpRes = getPolicySetBySubject(policySet['policy-set'][j], subject);
                        for (var e in tmpRes){
                            if (res[e] && tmpRes[e].length > 0){
                                res[e] = res[e].concat(tmpRes[e]);
                            }
                        }
                    }
                }
            }
            return res;
        }

        function checkPolicySetSubject(policySet, subject) {
            psSubject = null;
            var tempSubject = JSON.parse(JSON.stringify(subject));
            try{
                psSubject = policySet['target'][0]['subject'];
            }
            catch(err) {
                return 0; //subject not specified (it's still a subject match)
            }
            if (psSubject){
                for (var i in psSubject) {
                    temp = null;
                    try {
                        temp = psSubject[i]['subject-match'][0]['$']['match'];
                    } catch (err) { continue; }

                    // Change the string of psSubjectMatch_i to array psSubjectMatch_i.
                    var psSubjectMatch_i = temp.split(',');


                    if(psSubjectMatch_i.length > 1) {
                        for(var j in psSubjectMatch_i) {
                            // psSubjectMatch_i_j = null;
                            try {
                                var psSubjectMatch_i_j = psSubjectMatch_i[j];
                            } catch(err) { continue; }

                            var index = tempSubject.indexOf(psSubjectMatch_i_j);
                            if (index > -1){
                                //numMatchedSubjects++;
                                tempSubject.splice(index,1);
                            }
                        }
                    } else {
                        var index = tempSubject.indexOf(psSubjectMatch_i[0]);
                        if (index > -1) {
                            tempSubject.splice(index,1);
                        }
                    }
                }
                if (tempSubject.length == 0){
                    return 1; //subject matches
                }
            }
            return -1; //subject doesn't match
        }

        function getPolicyBySubject(policySet, subject) {
            var res = {'generic':[], 'matched':[]};
            // if(policySet['policy'] && checkPolicySetSubject(policySet, subject) > -1) {
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    var tempSubject = JSON.parse(JSON.stringify(subject));
                    pSubject = null;
                    try{
                        pSubject = policySet['policy'][j]['target'][0]['subject'];
                    }
                    catch(err) {
                        res['generic'].push(new policy(policySet['policy'][j]));
                    }
                    if (pSubject){
                        // var numMatchedSubjects = 0;
                        for (var i in pSubject) {
                            temp = null;
                            // pSubjectMatch_i = null;
                            try {
                                // pSubjectMatch_i = pSubject[i]['subject-match'][0]['$']['match'];
                                temp = pSubject[i]['subject-match'][0]['$']['match'];
                            } catch (err) { continue; }

                            var pSubjectMatch_i = temp.split(',');
                            if (pSubjectMatch_i.length > 1) {

                                for (var m in pSubjectMatch_i) {
                                    // pSubjectMatch_i_j = null;
                                    try {
                                        var pSubjectMatch_i_j = pSubjectMatch_i[m];
                                    } catch(err) { continue; }

                                    var index = tempSubject.indexOf(pSubjectMatch_i_j);
                                    if (index > -1){
                                        // numMatchedSubjects++;
                                        tempSubject.splice(index,1);
                                    }
                                }

                            } else {
                                var index = tempSubject.indexOf(pSubjectMatch_i[0]);
                                if (index > -1){
                                    // numMatchedSubjects++;
                                    tempSubject.splice(index,1);
                                }
                            }
                            if (tempSubject.length == 0) {
                                res['matched'].push(new policy(policySet['policy'][j]));
                                break;
                            }
                        }
                    }
                }
            }

            /*if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    var tmpRes = getPolicyBySubject(policySet['policy-set'][j], subject);
                    for (var e in tmpRes){
                        if (res[e] && tmpRes[e].length > 0){
                            res[e] = res[e].concat(tmpRes[e]);
                        }
                    }
                }
            }*/
            return res;
        }

        this.removeSubject = function(subjectId, policyId) {
            if(!_ps) {
                return null;
            }
            if(policyId == null) {
                return;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            if(policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        break;
                    }
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                }
            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };


        function removePolicySetById(policySet, policySetId) {
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policySetId) {
                        policySet['policy-set'].splice(j, 1);
                        return true;
                    }
                    /*if(removePolicyById(policySet['policy-set'][j], policyId)) {
                        return true;
                    }*/
                }
            }
            return false;
        }

        function removePolicyById(policySet, policyId) {
            //console.log('removePolicyById - id is '+policyId+', set is '+JSON.stringify(policySet));
            if(policySet['policy']) {
                for(var j in policySet['policy']) {
                    if(policySet['policy'][j]['$']['id'] == policyId) {
                        policySet['policy'].splice(j, 1);
                        return true;
                    }
                }
            }
            /*
            if(policySet['policy-set']) {
                for(var j in policySet['policy-set']) {
                    if(policySet['policy-set'][j]['$']['id'] == policyId) {
                        policySet['policy-set'].splice(j, 1);
                        return true;
                    }
                    if(removePolicyById(policySet['policy-set'][j], policyId)) {
                        return true;
                    }
                }
            }*/
            return false;
        }

        this.getInternalPolicySet = function(){
            return _ps;
        };

        this.createPolicy = function(policyId, combine, description){
//        function createPolicy(policyId, combine, description){
            return new policy(null, policyId, combine, description);
        };

        this.createPolicySet = function(policySetId, combine, description){
       //function createPolicySet(policySetId, combine, description){
            return new policyset(null, policySetId, _basefile, _fileId, policySetId, combine, description);
        };


      this.addPolicy = function(newPolicy, newPolicyPosition){
//      this.addPolicy = function(policyId, combine, description, newPolicyPosition, succCB){
//      var newPolicy = createPolicy(policyId, combine, description);
            if(!_ps)
                return null;

            if(!_ps["policy"])
                _ps["policy"] = new Array();
            else{
                for(var i =0; i<_ps["policy"].length; i++){
                    console.log(JSON.stringify(newPolicy.getInternalPolicy()));
                    if(_ps["policy"][i]['$']["id"] == newPolicy.getInternalPolicy()['$']["id"]){
                        console.log("A policy with " + newPolicy.getInternalPolicy()['$']["id"] + " is already present");
                        return;
                    }
                }
            }
            var position = (newPolicyPosition == undefined || newPolicyPosition<0 || _ps["policy"].length == 0) ? _ps["policy"].length : newPolicyPosition;
            _ps['policy'].splice(position, 0, newPolicy.getInternalPolicy());
            //succCB(newPolicy);

        };

        this.addPolicySet = function(newPolicySet, newPolicySetPosition){
        //this.addPolicySet = function(policySetId, combine, description, newPolicySetPosition){
            //var newPolicySet = createPolicySet(policySetId, combine, description);
            if(!_ps)
                return null;

            if(!_ps['policy-set'])
                _ps['policy-set'] = new Array();
            else{
                for(var i =0; i<_ps['policy-set'].length; i++){
                    console.log(JSON.stringify(newPolicySet.getInternalPolicySet()));
                    if(_ps['policy-set'][i]['$']['id'] == newPolicySet.getInternalPolicySet()['$']['id']){
                        console.log("A policyset with " + newPolicySet.getInternalPolicySet()['$']['id'] + " is already present");
                        return;
                    }
                }
            }
            var position = (newPolicySetPosition == undefined || newPolicySetPosition<0 || _ps['policy-set'].length == 0) ? _ps['policy-set'].length : newPolicySetPosition;
            _ps['policy-set'].splice(position, 0, newPolicySet.getInternalPolicySet());
            /*
            if(!_ps)
                return null;

            if(!_ps["policy-set"])
                _ps["policy-set"] = new Array();

            var position = (newPolicySetPosition == undefined || newPolicySetPosition<0 || _ps["policy-set"].length == 0) ? _ps["policy-set"].length : newPolicySetPosition;
//            var position = (!newPolicySetPosition || _ps["policy-set"].length == 0) ? 0 : newPolicySetPosition;

            _ps['policy-set'].splice(position, 0, newPolicySet.getInternalPolicySet());
            */
        };



        // add subject to policyset
        this.addSubject = function(newSubjectId, matches){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            var id = (newSubjectId) ? newSubjectId : new Date().getTime(); //Ecco perchè inserendo ID vuoto metto la data
            var newsubj = {"$" : {"id" : id} , "subject-match" : [] };

            for(var i in matches){
                if(i == "subject-match")
                    newsubj["subject-match"].push(matches[i]);
            }
            if(!policy.target)
                policy.target = [{}];

            if(!policy.target[0]["subject"])
                policy.target[0]["subject"] = [];

            //console.log(JSON.stringify(policy.target[0]));
            for(var i =0; i<policy.target[0]["subject"].length; i++){
                    if(policy.target[0]["subject"][i]['$']["id"] == newSubjectId){
                        console.log("A subject with " + newSubjectId + " is already present");
                        return;
                    }
                }
            policy.target[0]["subject"].push(newsubj);
            //console.log(JSON.stringify(policy.target[0]));

        };

        this.getPolicy = function(policyId){
            if (policyId){
                if(typeof policyId == "object" && policyId.length){
                    var res = getPolicyBySubject(_ps, policyId);
                    var tempSubject = replaceId(policyId);
                    // Because of the default copying action, the tempSubject can never be zero.
                    if ((tempSubject.indexOf("http://webinos.org/subject/id/PZ-Owner") != -1) || (tempSubject.indexOf("http://webinos.org/subject/id/known") != -1 )) {
                        var res2 = getPolicyBySubject(_ps, tempSubject);
                        var res = joinResult(res, res2);
                    }
                    return res;
                } else {
                    var tmp = getPolicyById(_ps, policyId);
                    if(tmp){
                        return new policy(tmp);
                    }
                }
            }
        };

        this.getPolicySet = function(policySetId){
            if(policySetId){
                if(typeof policySetId == "object" && policySetId.length){
                    var res = getPolicySetBySubject(_ps, policySetId);
                    var tempSubject = replaceId(policySetId);
                    if ((tempSubject.indexOf("http://webinos.org/subject/id/PZ-Owner") != -1) || (tempSubject.indexOf("http://webinos.org/subject/id/known") !=-1 )) {
                        var res2 = getPolicySetBySubject(_ps, tempSubject);
                        var res = joinResult(res, res2);
                    }
                    return res;
                } else {
                    var tmp = getPolicySetById(_ps, policySetId);
                    if(tmp){
                        return new policyset(tmp, "policy-set", _basefile, _fileId);
                    }
                }
            }
        };

/*
        this.getSubjects = function(policyId){
            if(!_ps) {
                return null;
            }

            var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;

            if(policy == null) {
                return null;
            }
            var subjects = policy.target[0]["subject"];

            return subjects;
        };
*/
        this.updateSubject = function(subjectId, matches){
        //this.updateSubject = function(subjectId, matches/*, policyId*/ ){
            if(!_ps) {
                return null;
            }

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            if(policy == null) {
                return null;
            }

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var subjects = policy.target[0]["subject"];
                for(var i in subjects){
                    console.log(subjects[i]['$']["id"]);
                    if(subjects[i]['$']["id"] == subjectId)
                        subjects[i]["subject-match"] = matches["subject-match"];
                }
            }
        };

        this.removePolicy = function(policyId){
            if(!_ps) {
                return null;
            }
            if(policyId == null) {
                return;
            }
            if (!_ps['policy']) {
                return null;
            }
            removePolicyById(_ps, policyId);
            if (_ps['policy'].length == 0) {
                _ps['policy'] = undefined;
            }
        };

        this.removePolicySet = function(policySetId){
            if(!_ps) {
                return null;
            }
            if(policySetId == null) {
                return;
            }
            if (!_ps['policy-set']) {
                return null;
            }
            removePolicySetById(_ps, policySetId);
            console.log(_ps['policy-set']);
            if (_ps['policy-set'].length == 0) {
                _ps['policy-set'] = undefined;
            }
        };



        this.removeSubject = function(subjectId) {
            if(!_ps) {
                return null;
            }
            /*
            if(policyId == null) {
                return;
            }*/

            //var policy = (policyId) ? getPolicyById(_ps, policyId) : _ps;
            var policy = _ps;

            //console.log(policy);

            var count = 0;

            if(policy.target && policy.target[0] && policy.target[0]["subject"]){
                var index = -1;
                for(var i in policy.target[0]["subject"]){
                    console.log(policy.target[0]["subject"][i]["$"]["id"]);
                    if(policy.target[0]["subject"][i]["$"]["id"] && policy.target[0]["subject"][i]["$"]["id"] == subjectId){
                        index = i;
                        //break;
                    }
                    count++;
                }
                if(index != -1){
                    console.log("remove "+index);
                    policy.target[0]["subject"].splice(index,1);
                    if(count == 1)
                        policy.target = undefined;
                }

            }
            //console.log("AFTER : " + JSON.stringify(policy["rule"]));
        };

        this.updateAttribute = function(key, value){
          if(key == "combine" || key == "description"){
            _ps['$'][key] = value;
          }
        };
        /*function(policySetId, combine, description){
            if(policySetId)
                _ps['$']["id"] = policySetId;
            if(combine)
                _ps['$']["combine"] = combine;
            if(description)
                _ps['$']["description"] = description;};*/


        this.toJSONObject = function(){
            return _ps;
            //return "ID : " + _id + ", DESCRIPTION : " + _ps.$.description + ", PATH : " + _basefile;
        }
    }

    var policyFiles = new Array();

    function getPolicySet(policyset_id, success, error) {
        var successCB = function(params){
            var ps = new policyset(params, "policy-set", policyset_id) ;
            console.log(ps);
            success(ps);
        }

        if(!policyFiles || policyFiles.length == 0) {
            var rpc = webinos.rpcHandler.createRPC(this, "getPolicy", [policyset_id]); // RPC service name, function, position options
            webinos.rpcHandler.executeRPC(rpc
                , function (params) {
                    successCB(params);
                }
                , function (error) {
                    console.log(error);
                }
            );
        }
        else {
            success(new policyset(policyFiles[policyset_id].content, "policy-set", policyset_id));
        }
    };

    function save(policyset, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "setPolicy", [policyset.getBaseFile(), JSON.stringify(policyset.toJSONObject())]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };

    function testPolicy(policyset, request, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "testPolicy", [policyset.getBaseFile(), JSON.stringify(request)]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };
    function testNewPolicy(policyset, request, successCB, errorCB) {
        var rpc = webinos.rpcHandler.createRPC(this, "testNewPolicy", [JSON.stringify(policyset.toJSONObject()), JSON.stringify(request)]);
        webinos.rpcHandler.executeRPC(rpc
            , function (params) {
                successCB(params);
            }
            , function (error) {
                errorCB(error);
            }
        );
    };

// Start point..............
// This function is used to test if the userId belongs to the friends array.
    function userBelongsToFriend(userId) {
        if (userId !== webinos.session.getPZHId()) {
            var friends = webinos.session.getConnectedPzh();
            var index = friends.indexOf(userId);
            if (index > -1){
                return 1;
            }
        }
        return 0;
    }
// This function is used to replace the elements (ids) in the subject, and to  make it simple, only two possible values, one is the generic URI of zone owner, and another is the friends. Then return the changed subject (tempSubject).
    function replaceId(subject) {
        var friendFound = false;
        var tempSubject = [];

        var zoneOwner = webinos.session.getPZHId();
        if (!zoneOwner) {
            zoneOwner = webinos.session.getPZPId();
        }

        for (var j in subject) {
            if (subject[j] === zoneOwner) {
                tempSubject.push("http://webinos.org/subject/id/PZ-Owner");
            } else if (userBelongsToFriend(subject[j])) {
                if (friendFound == false) {
                    tempSubject.push("http://webinos.org/subject/id/known");
                    friendFound = true;
                }
            // do nothing if friendFound is true
            } else {
                // default behaviour, copy item
                tempSubject.push(subject[j]);
            }
        }
        return tempSubject;
    }

    function deepCopy(p,c) {
        var c = c || {};
        for (var i in p) {
            if (typeof p[i] === 'object') {
                c[i] = (p[i].constructor === Array) ? [] : {};
                deepCopy(p[i], c[i]);
            }
            else {
                c[i] = p[i];
            }
        }
        return c;
    }

// This function used to join two results together, res2 only can have two elements at most, one in the generic set and one in the matched set. So ckecked them one by one is the easiest solution. To avoid duplication, in both if functions, also check if the element in the res2 already presented in the res1, if already presented, skip this step, other wise push the element in res1, and return res1.
    function joinResult(res1, res2) {
        var found_g = false, found_m = false;
        var res = deepCopy(res1);
        for (var i in res2['generic']) {
            for (var j in res1['generic']) {
                if (res1['generic'][j].toJSONObject() === res2['generic'][i].toJSONObject() ) {
                    found_g = true;
                    break;
                }
            }
            if (found_g == false) {
                res['generic'].push(res2['generic'][i]);
            }
            found_g = false;
        }

        for (var m in res2['matched']) {
            for (var n in res1['matched']) {
                if (res1['matched'][n].toJSONObject() === res2['matched'][m].toJSONObject() ) {
                    found_m = true;
                    break;
                }
            }
            if (found_m == false) {
                res['matched'].push(res2['matched'][m]);
            }
            found_m = false;
        }

        return res;
    }
})();
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2013 Sony Mobile Communications
 *
 ******************************************************************************/

(function () {

  RMModule = function (obj) {
    exports.WebinosService.call(this, obj);
  };

  // Inherit all functions from WebinosService
  RMModule.prototype = Object.create(exports.WebinosService.prototype);
  RMModule.prototype.constructor = RMModule;

  // Register to the service discovery
  _webinos.registerServiceConstructor("http://ubiapps.com/api/remotemanagement", RMModule);

  RMModule.prototype.bindService = function (bindCB, serviceId) {
    this.getInstalledApps = getInstalledApps;
    this.wipe = wipe;
    this.addDataService = addDataService;

    if (typeof bindCB.onBind === 'function') {
      bindCB.onBind(this);
    }
  };

  function getInstalledApps(success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "getInstalledApps");
    webinos.rpcHandler.executeRPC(rpc, function (lst) {
      if (typeof success !== 'undefined') {
        success(lst);
      }
    }, function (err) {
      if (typeof fail !== 'undefined') {
        fail(err);
      }
    });
  }

  function wipe(success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "wipe");
    webinos.rpcHandler.executeRPC(rpc, function (result) {
      if (typeof success === 'function') {
        success(result);
      }
    }, function (err) {
      if (typeof fail === 'function') {
        fail(err);
      }
    });
  }

  function addDataService(datasetName, success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "addDataService", [ datasetName ]);
    webinos.rpcHandler.executeRPC(rpc, function (result) {
      if (typeof success === 'function') {
        success(result);
      }
    }, function (err) {
      if (typeof fail === 'function') {
        fail(err);
      }
    });
  }

}());
/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2013 Sony Mobile Communications
 *
 ******************************************************************************/

(function () {

  DataModule = function (obj) {
    exports.WebinosService.call(this,obj);
  };

  DataModule.prototype = Object.create(exports.WebinosService.prototype);
  DataModule.prototype.constructor = DataModule;

  // Register to the service discovery
  _webinos.registerServiceConstructor("http://ubiapps.com/api/ubiappsData", DataModule);

  DataModule.prototype.bindService = function (bindCB, serviceId) {
    this.getSchema = getSchema;
    this.getRows = getRows;
    this.getRowCount = getRowCount;

    if (typeof bindCB.onBind === 'function') {
      bindCB.onBind(this);
    }
  };

  function getSchema(success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "getSchema");
    webinos.rpcHandler.executeRPC(rpc, function (result) {
      if (typeof success !== 'undefined') {
        success(result);
      }
    }, function (err) {
      if (typeof fail !== 'undefined') {
        fail(err);
      }
    });
  }

  function getRows(success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "getRows");
    webinos.rpcHandler.executeRPC(rpc, function (result) {
      if (typeof success === 'function') {
        success(result);
      }
    }, function (err) {
      if (typeof fail === 'function') {
        fail(err);
      }
    });
  }

  function getRowCount(success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "getRowCount");
    webinos.rpcHandler.executeRPC(rpc, function (result) {
      if (typeof success === 'function') {
        success(result);
      }
    }, function (err) {
      if (typeof fail === 'function') {
        fail(err);
      }
    });
  }

}());
/*******************************************************************************
*  Code contributed to the webinos project
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*  
*     http://www.apache.org/licenses/LICENSE-2.0
*  
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* 
* Copyright 2011 Alexander Futasz, Fraunhofer FOKUS
******************************************************************************/
(function() {

	/**
	 * Webinos Get42 service constructor (client side).
	 * @constructor
	 * @param obj Object containing displayName, api, etc.
	 */
	TestModule = function(obj) {
    exports.WebinosService.call(this, obj);
		
		this._testAttr = "HelloWorld";
		this.__defineGetter__("testAttr", function (){
			return this._testAttr + " Success";
		});
	};
	// Inherit all functions from WebinosService
	TestModule.prototype = Object.create(exports.WebinosService.prototype);
	// The following allows the 'instanceof' to work properly
	TestModule.prototype.constructor = TestModule;
	// Register to the service discovery
	_webinos.registerServiceConstructor("http://webinos.org/api/test", TestModule);
	
	/**
	 * To bind the service.
	 * @param bindCB BindCallback object.
	 */
	TestModule.prototype.bindService = function (bindCB, serviceId) {
		// actually there should be an auth check here or whatever, but we just always bind
		this.get42 = get42;
		this.listenAttr = {};
		this.listenerFor42 = listenerFor42.bind(this);
		
		if (typeof bindCB.onBind === 'function') {
			bindCB.onBind(this);
		};
	}
	
	/**
	 * Get 42.
	 * An example function which does a remote procedure call to retrieve a number.
	 * @param attr Some attribute.
	 * @param successCB Success callback.
	 * @param errorCB Error callback. 
	 */
	function get42(attr, successCB, errorCB) {
		console.log(this.id);
		var rpc = webinos.rpcHandler.createRPC(this, "get42", [attr]);
		webinos.rpcHandler.executeRPC(rpc,
				function (params){
					successCB(params);
				},
				function (error){
					errorCB(error);
				}
		);
	}
	
	/**
	 * Listen for 42.
	 * An exmaple function to register a listener which is then called more than
	 * once via RPC from the server side.
	 * @param listener Listener function that gets called.
	 * @param options Optional options.
	 */
	function listenerFor42(listener, options) {
		var rpc = webinos.rpcHandler.createRPC(this, "listenAttr.listenFor42", [options]);

		// add one listener, could add more later
		rpc.onEvent = function(obj) {
			// we were called back, now invoke the given listener
			listener(obj);
			webinos.rpcHandler.unregisterCallbackObject(rpc);
		};

		webinos.rpcHandler.registerCallbackObject(rpc);
		webinos.rpcHandler.executeRPC(rpc);
	}
	
}());

