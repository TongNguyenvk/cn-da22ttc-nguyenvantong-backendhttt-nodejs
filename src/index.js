const server = require('./app');
const PORT = process.env.PORT || 8888;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket server is running on ws://localhost:${PORT}`);
}); 