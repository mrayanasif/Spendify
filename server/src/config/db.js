const mongoose = require('mongoose');
const dns = require('node:dns');

function configureAtlasDns(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;

  // Use Vercel's managed resolver in production unless the project explicitly
  // supplies DNS servers. Some local Windows DNS forwarders fail Atlas SRV.
  if (process.env.VERCEL && !process.env.MONGODB_DNS_SERVERS) return;

  // Node on some Windows setups inherits a localhost DNS forwarder that does
  // not answer Atlas SRV lookups. Allow an override for networks with a
  // required resolver; otherwise use public recursive resolvers.
  const servers = (process.env.MONGODB_DNS_SERVERS || '1.1.1.1,8.8.8.8')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  dns.setServers(servers);
}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy server/.env.example to server/.env first.');
  }

  // Fail early with an actionable message when an Atlas URI was pasted with
  // surrounding quotes or whitespace from the Atlas connection dialog.
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }

  configureAtlasDns(uri);

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const { host, name } = mongoose.connection;
    console.log(`  database   : connected to "${name}" on ${host}`);
  } catch (err) {
    console.error('\n  Could not reach MongoDB.');
    // Never print the URI: it contains the database username and password.
    // Atlas errors commonly come from IP access rules, credentials, or a typo
    // in the cluster hostname, so point to those checks without leaking secrets.
    console.error(`  Error: ${err.name}${err.code ? ` (${err.code})` : ''}`);
    if (uri.startsWith('mongodb+srv://')) {
      console.error('  For Atlas, check the cluster hostname, database user/password (URL-encode special characters), and Network Access IP allowlist.');
    } else {
      console.error('  Check that MongoDB is running and the host/port in MONGODB_URI are correct.');
    }
    console.error('');
    throw new Error(`MongoDB connection failed (${err.name}). Check the database connection settings above.`);
  }
}

module.exports = { connectDatabase };
