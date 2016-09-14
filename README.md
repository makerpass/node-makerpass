# node-makerpass

First install:

    $ npm install --save node-makerpass

Then require it in your node app:

```js
var MP = require('node-makerpass');
```

## Authentication

There are three ways to protect your endpoints behind a MakerPass auth: via sessions, a header, or directly.

### Session Auth

The `authWithSession` middleware works particularly well if you are storing your MakerPass OAuth access token inside a session (similar to [the example shown here](https://github.com/makerpass/passport-makerpass#setup-with-express)):

```js
app.post('/comments', MP.authWithSession(), function (req, res) {

  req.makerpassToken //=> token stored here to normalize between different auths

  req.user   //=> { uid, name, email, avatar_url }
  req.scopes //=> ['public', 'profile.basic', ...]

  res.send(`Welcome, ${req.user.name}!`);
});

//
// Additional options:
//

// This will read req.session.accessToken
MP.authWithSession();
// Same as above
MP.authWithSession({ name: 'session', propName: 'accessToken' });

// This will read req.mySession.accessToken
MP.authWithSession({ name: 'mySession' });

// This will read req.session.mpToken
MP.authWithSession({ propName: 'mpToken' });

// You can also specify a redirect on failure
MP.authWithSession({ redirectOnFailure: '/' })
```

### Header Auth

If your client is sending a MakerPass OAuth access token via the `Authorization` header, you can auto-check for that using `authWithBearer`:

```js
//
// This works if a client sends a request with header that looks like:
// 'Authorization': 'Bearer myToken123'
//
app.post('/comments', MP.authWithBearer(), function (req, res) {

  req.makerpassToken //=> token stored here to normalize between different auths

  req.user   //=> { uid, name, email, avatar_url }
  req.scopes //=> ['public', 'profile.basic', ...]

  res.send(`Welcome, ${req.user.name}!`);
});
```

### Multi-Auth

If you want to enable both session and header auth, you can use `authWithBearerOrSession`:

```js
//
// This works if a client sends a request with header that looks like:
// 'Authorization': 'Bearer myToken123'
//
app.post('/comments',
  //
  // The Authorization header will takes priority.
  // The redirectOnFailure option only applies when there is no Bearer token.
  //
  MP.authWithBearerOrSession({ redirectOnFailure: '/' }),

  function (req, res) {

    req.makerpassToken //=> token stored here to normalize between different auths

    req.user   //=> { uid, name, email, avatar_url }
    req.scopes //=> ['public', 'profile.basic', ...]

    res.send(`Welcome, ${req.user.name}!`);
  }
);
```


### Direct Auth

If you already have access to your token, or want to do things manually, you can use `authToken`:

```js
MP.authToken(myAccessToken)
  .then(function(response) {
    response.data.user   //=> { uid, name, email, avatar_url }
    response.data.scopes //=> ['public', 'profile.basic', ...]
  })
  .catch(function(errResponse) {
    errResponse.status //=> 401, etc.
    errResponse.data   //=> 'the_error_message'
  });
```

### Scope Validation

You can control access by requiring certain scopes from your user's accessToken. For example:

```js
app.get(
  '/admin/dashboard',
  MP.authWithSession(),
  MP.requireScope('admin.read'),
  function (req, res) {
    res.send("You are an admin.")
  }
)
```

## API methods

Assuming you have already an `accessToken` obtained from e.g. [passport-makerpass](https://github.com/makerpass/passport-makerpass), you can request MakerPass data like the following:

```js
MP.me(myAccessToken)
  .then(function (user) {
    console.log("You access token belongs to", user.name);
  });
```

The following methods are available:

- `MP.me.groups(myAccessToken)` - Get all groups for owner of access token

- `MP.me.schools(myAccessToken)` - Get all schools for owner of access token

- `MP.me.adminStatus(myAccessToken)` - Get all groups and schools you currently admin

- `MP.user(userUid, myAccessToken)` - Get information for a specific user

- `MP.user.groups(userUid, myAccessToken)` - Get all groups for a specific user

- `MP.group(nameId, myAccessToken)` - Get information for a group. **Note:** A name id is a string. For example: `mks-24`

- `MP.group.memberships(nameId, myAccessToken)` - Get all memberships for a group. See note above about name ids

### Manual URLs

If you find a MakerPass API URL that is not supported by this lib, no need to wait; you can make requests manually:

```js
MP.Memberships.get('/some/future/url', myAccessToken)
  .then(function (data) {
    console.log("You got the data:", data);
  });
```

## Testing

When you're testing your own API endpoints, it's useful to mock the client's user and scopes. You can do this by setting the environment variable `NODE_ENV=test` and adding a middleware that explicitly sets the `user` and `scopes` properties on the request object:

```js
process.env.NODE_ENV = 'test';
var express = require('express');
var request = require('supertest-as-promised');

var AdminAPI = require('../server/apis/admin-api.js');

describe("My API", function () {

  var currentUser   = null;
  var currentScopes = null;

  var testApp = express()

  // Set req.user and req.scopes on every request
  testApp.use(function (req, res, next) {
    req.user   = currentUser;
    req.scopes = currentUser;
  })

  testApp.use('/admin', AdminAPI)

  beforeEach(function () {
    // Reset to standard values before every test
    currentUser   = { name: 'Alice', uid: 'alice' };
    currentScopes = ['public', 'admin.read'];
  })

  it("requires admin.read scope", function () {
    currentScopes = ['public']
    return request(testApp)
      .get('/admin/dashboard')
      .expect(403)
  })

  it("returns dashboard data", function () {
    return request(testApp)
      .get('/admin/dashboard')
      .expect(200)
  })

})
```
