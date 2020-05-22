/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
var http = require('http');
const {DefaultAzureCredential, ManagedIdentityCredential} = require('@azure/identity');
const {SecretClient} = require('@azure/keyvault-secrets');

const credential = new DefaultAzureCredential();

// Replace value with your Key Vault name here
const vaultName = "<YourVaultName>";
const url = `https://${vaultName}.vault.azure.net`;
  
const client = new SecretClient(url, credential);

// Replace value with your secret name and value here
const secretName = "my-secret";
const secretValue = 'test-secret-value'

var server = http.createServer(function(request, response) {
    response.writeHead(200, {"Content-Type": "text/plain"});
    async function main(){
        // Get the secret we created
        const secret = await client.setSecret(secretName, secretValue);
        const result = await client.getSecret(secretName);
        response.write(`Your secret value is: ${result.value}\n`);
        response.write("Successfully retrieved 'test-secret'");
        response.end();
    }
    main().catch((err) => {
        response.write(`error code: ${err.code}`);
        response.write(`error message: ${err.message}`);
        response.write(`error stack: ${err.stack}`);
        response.end();
    });
});

var port = process.env.PORT || 1337;
server.listen(port);

console.log("Server running at http://localhost:%d", port);