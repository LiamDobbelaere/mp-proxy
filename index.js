const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const clients = {};
let lastCleanupTime = new Date();

server.on('error', (err) => {
    console.log(`server error:\n${err.stack}`);
    server.close();
});

server.on('message', (msg, rinfo) => {
    if (new Date() - lastCleanupTime > 10000) {
        const clientsToDelete = [];
        Object.keys(clients).forEach((key) => {
            const client = clients[key];

            client.connections = client.connections.filter(conn => new Date() - conn.lastReceived < 10000);

            if (!client.connections.length) {
                clientsToDelete.push(key);
            }
        });

        clientsToDelete.forEach(key => {
            console.log('cleaned up client ' + key);
            delete clients[key];
        });

        if (clientsToDelete.length) {
            console.log(JSON.stringify(clients, undefined, 2));
        }

        lastCleanupTime = new Date();
    }

    const clientPort = rinfo.port;
    let clientId, packetId;
    try {
        clientId = msg.readUInt32BE(0);
        packetId = msg.readUInt32BE(4);
    } catch (err) {
        console.log(err);
        return;
    }

    if (!clients[rinfo.address]) {
        clients[rinfo.address] = {
            connections: [
                newConnection(clientId, clientPort, packetId)
            ]
        };
        console.log(JSON.stringify(clients, undefined, 2));
    } else {
        const client = clients[rinfo.address];
        const connection = client.connections.find(conn => conn.clientId === clientId);

        if (!connection) {
            client.connections = client.connections.filter(conn => new Date() - conn.lastReceived < 10000);

            if (client.connections.length >= 5) {
                return;
            }

            client.connections.push(newConnection(clientId, clientPort, packetId));
        }
    }

    const client = clients[rinfo.address];
    const connection = client.connections.find(conn => conn.clientId === clientId);
    if (connection.lastPacketId > packetId) {
        return;
    }
    connection.lastReceived = new Date();
    connection.lastPacketId = packetId;

    broadcast(msg);
});

server.on('listening', () => {
    const address = server.address();
    console.log(`UDP server listening ${address.address}:${address.port}`);
});

server.bind(34170);

function newConnection(clientId, clientPort, packetId) {
    return { clientId, clientPort, established: new Date(), lastReceived: new Date(), lastPacketId: packetId };
}

function broadcast(msg) {
    Object.keys(clients).forEach(ip => {
        const client = clients[ip];
        client.connections.forEach(conn => {
            server.send(msg, conn.clientPort, ip, (err, bytes) => {
                if (err) {
                    console.log(err);
                }
            });
        });
    });
}