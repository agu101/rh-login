const request = require('request');
const express = require('express');
const bouncer = require('express-bouncer')(60000, 600000, 3);
const app = express();

const port = process.env.PORT || 3000;

app.set('view-engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/public'));

let alexainput;
let loginMessage;

app.get('/', (req, res) => {
    // login page, and gets Amazon state and redirect uri
    res.render('index.ejs', { loginMessage: loginMessage });
    if (req.query.state && req.query.redirect_uri) {
        alexainput = {
            state: req.query.state,
            redirect_uri: req.query.redirect_uri
        };
    }
});

// login to RH and retrieve auth token
// should find out a way to limit login attmepts
// send token to amazon included in the query
app.post('/login', bouncer.block, (req, res) => {
    // Robinhood login url
    const rhurl = new URL('/oauth2/token/', 'https://api.robinhood.com');
    rhurl.searchParams.append('grant_type', 'password');
    rhurl.searchParams.append('client_id', '');
    rhurl.searchParams.append('device_token', '');
    rhurl.searchParams.append('expires_in', 86400);
    rhurl.searchParams.append('challenge_type', 'sms');

    var username = req.body.username;
    var password = req.body.password;

    rhurl.searchParams.append('username', username);
    rhurl.searchParams.append('password', password);

    // Redirect url
    if (alexainput) {
        const redurl = new URL(alexainput.redirect_uri);
        redurl.set('state', alexainput.state);
    }

    // POST to Robinhood, get tokens
    request.post(rhurl.toString(), (error, response) => {
        console.error('error: ', error);
        console.log('status code: ', response.statusCode);
        if (response.statusCode === 400) {
            console.log("Bad Request: 400");
            loginMessage = "Invalid login credentials";
            res.redirect('/');
        } else if (response.statusCode !== 200) {
            console.log("login failed");
            loginMessage = "Login failed";
            res.redirect('/');
        } else {
            bouncer.reset(req);
            let refresh_token = JSON.parse(response.toJSON().body).refresh_token;
            if (alexainput) {
                redurl.set('code', refresh_token);
                // redirect to amazon
                res.redirect(redurl.toString());
            }
        }
    });
});

// handle access token request or refresh token request
app.post('/token', (req, res) => {
    let refresh_token = null;
    let access_token = null;
    let expires_in = null;
    // access token request
    if (req.query.grant_type === "authorization_code") {
        refresh_token = req.query.code;
    } else if (req.query.grant_type === "refresh_token") {
        refresh_token = req.query.refresh_token;
    }

    // Robinhood refresh token url
    const refreshUrl = new URL('/oauth2/token/', 'https://api.robinhood.com');
    refreshUrl.searchParams.append('grant_type', 'refresh_token');
    refreshUrl.searchParams.append('client_id', 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS');
    refreshUrl.searchParams.append('scope', 'internal');
    refreshUrl.searchParams.append('expires_in', 86400);
    refreshUrl.searchParams.append('refresh_token', refresh_token);

    // POST to Robinhood, get tokens
    request.post(refreshUrl.toString(), (error, response) => {
        console.error('error: ', error);
        console.log('status code: ', response.statusCode);
        if (response.statusCode !== 200) {
            console.log("login failed");// change to a message on the page
        } else {
            access_token = JSON.parse(response.toJSON().body).access_token;
            refresh_token = JSON.parse(response.toJSON().body).refresh_token;
            expires_in = JSON.parse(response.toJSON().body).expires_in;
        }
    });
    if (access_token && refresh_token) {
        res.status(200).send(
            {
                "access_token": access_token,
                "token_type": "bearer",
                "expires_in": expires_in,
                "refresh_token": refresh_token
            }
        );
    } else {
        res.status(500).send({ error: 'something got messed up' });
    }
});

app.listen(port, () => {
    console.log('Listening on port ' + port);
});
