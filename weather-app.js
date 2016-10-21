/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';

var util = require('util');
var path = require('path')
var http = require('http');
var msRestAzure = require('ms-rest-azure');
var ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
var KeyVaultManagementClient = require('azure-arm-keyvault')
var KeyVault = require('azure-keyvault');
var AuthenticationContext = require('adal-node').AuthenticationContext;

// service principal details for running the sample
var clientId = process.env['CLIENT_ID']; // service principal
var domain = process.env['DOMAIN']; // tenant id
var secret = process.env['APPLICATION_SECRET'];

// service principal details that we have authorized to interact with key vault
var keyVaultSp = process.env['SP_KEYVAULT_OPERATIONS'];
var keyVaultSpSecret = process.env['WEATHER_APP_KEY'];

// the secret's information in the key vault.
var keyVaultSecretName = process.env['KEYVAULT_SECRET_NAME'];
var keyVaultSecretVersion = process.env['KEYVAULT_SECRET_VERSION'];

var keyVaultClient;

if (process.argv.length < 4) {
    console.log("Usage: node " + path.basename(__filename) + " keyvault-name city-name");
    process.exit(-1);
}

var vaultName = process.argv[2];
var vaultUri = `https://${vaultName}.vault.azure.net/secrets/${keyVaultSecretName}`;
var city = process.argv[3];

// login to azure
msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
    if (err) return console.log(err);

    // authenticate with key vault with a service principal that we gave access in index.js
    var kvCredentials = new KeyVault.KeyVaultCredentials(authenticator);
    keyVaultClient = new KeyVault.KeyVaultClient(kvCredentials);

    // get the secret's value (api key for openweathermap).
    keyVaultClient.getSecret(vaultUri,
        (err, result) => {
            if (err) throw err;

            var requestUri = `http://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&APPID=${result.value}`;

            // query openweathermap api and get weather data.
            http.get(requestUri, (res) => {
                var str = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    str += chunk;
                });
                res.on('end', () => {
                    var weatherData = JSON.parse(str);
                    console.log(`current conditions for ${weatherData.name},${weatherData.sys.country}: ${weatherData.main.temp} Celsius and ${weatherData.weather[0].description}`);
                });
            }).on('error', (e) => {
                console.log(`Got error: ${e.message}`);
            });
        });
});

function authenticator(challenge, callback) {
    // Create a new authentication context.
    var context = new AuthenticationContext(challenge.authorization);

    // Use the context to acquire an authentication token.
    return context.acquireTokenWithClientCredentials(challenge.resource, keyVaultSp, keyVaultSpSecret, function (err, tokenResponse) {
        if (err) throw err;
        // Calculate the value to be set in the request's Authorization header and resume the call.
        var authorizationValue = tokenResponse.tokenType + ' ' + tokenResponse.accessToken;

        return callback(null, authorizationValue);
    });
}