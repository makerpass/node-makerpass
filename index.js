var http = require('axios');
var curry = require('curry');


exports.authWithSession = function (options) {
  options = options || {};
  options.name = 'session';
  options.propName = options.propName || 'accessToken';

  return function (req, res, next) {

    if ( process.env.NODE_ENV === 'test' ) {
      if ( req.user && req.scopes ) return next();
      else throw new Error('[Test Env] Please set req.user and req.scopes');
    }

    exports.authToken( req[options.name][options.propName] )
      .then(function(response) {
        req.user = response.data.user;
        req.scopes = response.data.scopes;
        next();
      })
      .catch(function(errResponse) {
        res.status(errResponse.status).send(errResponse.data);
      });
  };
}

exports.authWithBearer = function (options) {
  options = options || {};

  return function (req, res, next) {

    if ( process.env.NODE_ENV === 'test' ) {
      if ( req.user && req.scopes ) return next();
      else throw new Error('[Test Env] Please set req.user and req.scopes');
    }

    exports.authToken( req.get('Authorization') )
      .then(function(response) {
        req.user = response.data.user;
        req.scopes = response.data.scopes;
        next();
      })
      .catch(function(errResponse) {
        res.status(errResponse.status).send(errResponse.data);
      });
  };
};

exports.authToken = function (token) {
  return http.get('https://api.makerpass.com/me', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
};

exports.requireScope = function () {
  var requiredScopes = Array.prototype.slice.apply(arguments)

  return function (req, res, next) {

    for (var i=0; i < requiredScopes.length; i++) {
      if ( req.scopes.indexOf( requiredScopes[i] ) === -1 )
        return res.status(401).send({
          error: 'scope_required',
          scope: requiredScopes[i] })
    }
    next()
  }
}


//
// Generic request function to be molded for all API endpoints.
//
var request = curry(function (host, method, url, accessToken) {

  http[method](url, {
    headers: { 'Authorization': `bearer ${token}` }
  })
    .then( response => response.data );
});


var apiRequest = request('https://api.makerpass.com');

// Generic request methods for forward compatibility
exports.Memberships = {
  get:    apiRequest('get'),
  post:   apiRequest('post'),
  put:    apiRequest('put'),
  patch:  apiRequest('patch'),
  delete: apiRequest('delete'),
};

//
// First-class Memberships API
//
exports.me             = apiRequest('get', '/me');
exports.me.groups      = apiRequest('get', '/me/groups');
exports.me.schools     = apiRequest('get', '/me/schools');
exports.me.adminStatus = apiRequest('get', '/me/admin-status');

exports.user        = (userUid, token) => apiRequest('get', `/users/${userUid}`, token);
exports.user.groups = (userUid, token) => apiRequest('get', `/users/${userUid}/groups`, token);

exports.group = (nameId, token) => apiRequest('get', `/groups/${nameId}`, token);
