const express = require('express');
const bodyParser = require('body-parser');
const https = require('https');

const app = express();
CLIENT_ID="CLIENT_ID"
API_TOKEN="API_TOKEN"
ALLOWED_DOMAIN = "frontegg.com"
TENANT_TO_ASSIGN="TENANT_TO_ASSIGN"
ROLE_ID="ROLE_ID"
const API_URL = "https://api.frontegg.com";
const DEFAULT_HEADERS = {
  "accept": "application/json",
  "content-type": "application/json"
};

// ------------------
// Utility functions:
// ------------------
function extractEmailDomain(email) {
    return email.split("@")[1];
  }
  
  function generateResponse(continueStatus) {
    if (continueStatus) {
      return {
        continue: true
      };
    } else {
      return {
        continue: false,
        error: {
          status: 403,
          message: ["Sorry, you're not allowed to signup"]
        }
      };
    }
  }
  
  async function callApi(method, url, payload, headers) {
    console.log(`* New request:
    ${"-".repeat(100)}
    method: ${method}
    url: ${url}
    payload: ${payload}
    headers: ${JSON.stringify(headers)}
    ${"-".repeat(100)}\n`);
  
    const options = {
      method: method,
      headers: headers
    };
  
    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = "";
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          console.log(`Response:\n${data}\n`);
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            console.log(`Error parsing response data as JSON:\n${error}`);
            resolve(data); // Resolve with the raw data as a string
          }
        });
      });
  
      req.on('error', (error) => {
        console.log(`No response, or error decoding response as JSON:\n${error}`);
        reject(error);
      });
  
      req.write(payload);
      req.end();
    });
  }
  
  
  async function getVendorJwt() {
    const url = API_URL + "/auth/vendor/";
    const payload = JSON.stringify({ clientId: CLIENT_ID, secret: API_TOKEN });
  
    try {
      const res = await callApi("POST", url, payload, DEFAULT_HEADERS);
      const returnedJwt = res.token;
      return returnedJwt;
    } catch (error) {
      console.error("Error getting Vendor JWT:", error);
      throw error;
    }
  }
  
  async function assignToTenant(userId, email, tenantId) {
    const vendorJwt = await getVendorJwt();
    console.log(vendorJwt);
  
    // Part 1: assign to tenant
    let url = API_URL + `/identity/resources/users/v2`;
    let payload = JSON.stringify({
      email: email,
      roleIds: [ROLE_ID],
      skipInviteEmail: true,
      invitationStatus: "Activated"
    });
  
    await callApi("POST", url, payload, {
      authorization: `Bearer ${vendorJwt}`,
      "frontegg-tenant-id": TENANT_TO_ASSIGN,
      accept: "application/json",
      "content-type": "application/json"
    });
  
    // Part 2: delete new tenant
    url = API_URL + `/tenants/resources/tenants/v1/${tenantId}`;
    await callApi("DELETE", url, JSON.stringify({}), {
      authorization: `Bearer ${vendorJwt}`,
    });
  }
  
  // -------
  // Routes:
  // -------
  app.use(bodyParser.json());
  app.post("/customclaims", (req, res) => {
    console.log("custom claim route!")
    return res.send({
      continue: true,
      response: {
        claims: {
          tenantId: "testId",
          customClaims: { claim: "Test Claim" },
        },
      },
    });
  })
  app.post("/prehook", (req, res) => {
    const { email } = req.body.data.user;
    const emailDomain = extractEmailDomain(email);
  
    if (emailDomain === ALLOWED_DOMAIN) {
      const response = generateResponse(true);
      return res.json(response);
    } else {
      const response = generateResponse(false);
      return res.status(401).json(response);
    }
  });
  app.use("/webhook", (req, res) => {
    const { id } = req.body.user;
    const { email } = req.body.user;
    const { tenantId } = req.body.user;
    console.log(`userId = ${id}\ntenantId = ${tenantId}`);
  
    assignToTenant(id, email, tenantId)
  
    const response = generateResponse(true);
    return res.json(response);
})
app.post("/saml", (req, res) => {
  const { email } = req.body.data.samlMetadata.email;
  console.log("SAML route!")
  console.log(req.body)
  return res.send({
    continue: true,
    response: {
      user: {
        email: email,
        metadata: JSON.stringify({
          "fieldA": "valueX",
          "fieldB": "valueY"
        })
      }
    },
  });
})

// ----
// Run:
// ----  

// Start the server
app.listen(5000, () => {
    console.log('Server is running on port 5000');
  });
