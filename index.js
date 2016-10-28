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
      return null; // suppress bluebird warnings
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

exports.requireMembership = function () {
  var validRoles = Array.prototype.slice.apply(arguments)
  var options = isObject( validRoles[validRoles.length-1] )
    ? validRoles.pop()
    : {}

  return function (req, res, next) {
    if ( ! req.makerpassToken ) {
      return res.status(401).send({ reason: 'no_token' })
    }

    var nameId = req.params.group_id || req.params.group_uid

    exports.groupAccess( nameId, req.makerpassToken )
      .then(function (access) {
        // access //=> { group_role, group_uid, school_admin_role, school_uid }
        if (
          validRoles.includes(access.group_role) ||
          (options.allowSchoolAdmins !== false && access.school_admin_role)
        ) {
          next()
        }
        else {
          res.status(403).send({ reason: 'not_member_of_group' })
        }
      })
      .catch(function (err) {
        if ( err.response ) {
          // Error response code from exports.groupAccess()
          res.status(err.response.status).send({ reason: err.response.data.message })
        }
        else throw err
      })
  }
}

exports.requireUserConnection = function (options={}) {
  options.role = options.role || []
  options.schoolAdminRole = options.schoolAdminRole === false
    ? []
    : (options.schoolAdminRole || ['owner', 'collaborator']) // defaults

  if ( ! Array.isArray(options.role) ) {
    options.role = [options.role]
  }
  if ( ! Array.isArray(options.schoolAdminRole) ) {
    options.schoolAdminRole = [options.schoolAdminRole]
  }

  return function (req, res, next) {

    if ( ! req.makerpassToken ) {
      return res.status(401).send({ reason: 'no_token' })
    }

    var user_uid = req.params[ options.paramKey || 'user_uid' ]

    exports.user.connections(user_uid, req.makerpassToken)
      .then(function (conns) {

        var isValid = true

        if ( options.role.length ) {
          isValid = isValid && !! conns.groups.find( g => options.role.includes(g.role) )
          if ( ! isValid ) {
            return res.status(403).send({ reason: 'invalid_connection', type: 'group', required: options.role })
          }
        }

        var sRole = options.schoolAdminRole
        if ( sRole.length ) {
          isValid = isValid && !! conns.school_admin_schools.find( s => sRole.includes(s.role) )
          if ( ! isValid ) {
            return res.status(403).send({ reason: 'invalid_connection', type: 'school_admin', required: sRole })
          }
        }

        next()
      })
      .catch(function (err) {
        if ( err.response ) {
          // Error response code from exports.groupAccess()
          res.status(err.response.status).send({ reason: err.response.data.message })
        }
        else throw err
      })
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
exports.me.groupAccess = (nameId, token) => apiRequest('get', '/me/groups/${nameId}/access', token);

exports.user        = (userUid, token) => apiRequest('get', `/users/${userUid}`, token);
exports.user.groups = (userUid, token) => apiRequest('get', `/users/${userUid}/groups`, token);
exports.user.connections = (userUid, token) => apiRequest('get', `/users/${userUid}/connections`, token);

exports.group = (nameId, token) => apiRequest('get', `/groups/${nameId}`, token);
exports.group.memberships = (nameId, token) => apiRequest('get', `/groups/${nameId}/memberships`, token);


exports.memberships = (nameId, token) => {
  console.warn(".memberships() is deprecated. Please use .group.memberships() instead.")
  return apiRequest('get', `/groups/${nameId}/memberships`, token)
};


//
// Helpers
//
var type = {}.toString
function isObject (x) { return type.call(x) === '[object Object]' }
