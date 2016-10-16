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

    if ( ! req[options.name] ) {
      return res.status(401).send({ reason: "no_session" });
    }

    var token = req[options.name][options.propName];
    authTokenAndHandleResponse( token, options, req, res, next );
  };
}

exports.authWithBearer = function (options) {
  options = options || {};

  return function (req, res, next) {

    if ( process.env.NODE_ENV === 'test' ) {
      if ( req.user && req.scopes ) return next();
      else throw new Error('[Test Env] Please set req.user and req.scopes');
    }

    var token = req.get('Authorization').replace(/^Bearer /, '');

    if ( ! token ) {
      return res.status(401).send({ reason: 'invalid_authorization_header' });
    }

    authTokenAndHandleResponse( token, options, req, res, next );
  };
};

exports.authWithBearerOrSession = function (options) {
  options = options || {};
  options.name = 'session';
  options.propName = options.propName || 'accessToken';

  return function (req, res, next) {

    if ( process.env.NODE_ENV === 'test' ) {
      if ( req.user && req.scopes ) return next();
      else throw new Error('[Test Env] Please set req.user and req.scopes');
    }

    // Bearer token
    var header = req.get('Authorization');
    var token  = header && header.replace(/^Bearer /, '');

    if ( ! token ) {
      // Session token
      token = req[options.name] && req[options.name][options.propName];
    }
    else {
      // There is a bearer token, so this is a programmatic request;
      // don't redirect in the case of failure.
      delete options.redirectOnFailure;
    }

    authTokenAndHandleResponse( token, options, req, res, next );
  };

}

function authTokenAndHandleResponse (token, options, req, res, next) {

  // Normalize token location between different auths for convenience
  req.makerpassToken = token

  exports.authToken( token )
    .then(function(response) {
      req.user = response.data.user;
      req.scopes = response.data.scopes;
      next();
    })
    .catch(function(errResponse) {
      if ( options.required === false ) {
        next()
      }
      else if ( options.redirectOnFailure ) {
        res.redirect( options.redirectOnFailure );
      }
      else {
        res.status(errResponse.status).send(errResponse.data);
      }
    });
}


exports.authToken = function (token, options) {
  return http.get('https://api.makerpass.com/me', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
};

exports.requireScope = function () {
  var requiredScopes = Array.prototype.slice.apply(arguments)

  return function (req, res, next) {

    if ( ! req.scopes ) {
      return res.status(401).send({ reason: 'no_scopes' })
    }

    for (var i=0; i < requiredScopes.length; i++) {
      if ( req.scopes.indexOf( requiredScopes[i] ) === -1 )
        return res.status(401).send({
          reason: 'scope_required',
          scope: requiredScopes[i] })
    }
    next()
  }
}


//
// Generic request function to be molded for all API endpoints.
//
var request = curry(function (host, method, url, accessToken) {

  return http[method]( host + url, {
    headers: { 'Authorization': `bearer ${accessToken}` }
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
exports.memberships = (nameId, token) => apiRequest('get', `/groups/${nameId}/memberships`, token);
