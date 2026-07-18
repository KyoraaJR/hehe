exports.handler = async function (event, context) {
  const address = event.queryStringParameters.address;
  
  if (!address) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Address parameter wajib diisi." }),
    };
  }

  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report`);
    
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `RugCheck API memberikan respon HTTP ${response.status}` }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // No Access-Control-Allow-Origin here on purpose: this function is only ever
        // called same-origin (from this site's own app.js), so it doesn't need CORS
        // headers. Leaving "*" here would let any other website call it directly and
        // burn your Netlify function quota for free.
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Gagal fetch RugCheck: ${error.message}` }),
    };
  }
};