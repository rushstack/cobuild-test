const credentials = `${process.env.GRADLE_USER}:${process.env.GRADLE_PASSWORD}`;
console.log('Basic ' + Buffer.from(credentials).toString('base64'));
