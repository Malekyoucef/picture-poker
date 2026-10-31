let peer;
let conn;
let lastBetAmount = 0; // Tracks how many pictures the last person bet

const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const statusMsg = document.getElementById('status-msg');
const potArea = document.getElementById('pot-area');
const ruleTracker = document.getElementById('rule-tracker');

// --- 1. MULTIPLAYER SETUP ---

// Host creates a game
document.getElementById('host-btn').addEventListener('click', () => {
    peer = new Peer(); // Generates random ID
        peer.on('open', (id) => {
                document.getElementById('host-id').innerText = id;
                        statusMsg.innerText = "Waiting for Player 2 to join...";
                            });

                                peer.on('connection', (connection) => {
                                        conn = connection;
                                                setupGame();
                                                    });
                                                    });

                                                    // Player 2 joins
                                                    document.getElementById('join-btn').addEventListener('click', () => {
                                                        const hostId = document.getElementById('join-id').value;
                                                            peer = new Peer();
                                                                peer.on('open', () => {
                                                                        conn = peer.connect(hostId);
                                                                                conn.on('open', () => {
                                                                                            setupGame();
                                                                                                    });
                                                                                                        });
                                                                                                        });

                                                                                                        function setupGame() {
                                                                                                            setupScreen.style.display = 'none';
                                                                                                                gameScreen.style.display = 'block';
                                                                                                                    
                                                                                                                        // Listen for data coming from the other player
                                                                                                                            conn.on('data', (data) => {
                                                                                                                                    if (data.type === 'BET') {
                                                                                                                                                displayImages(data.images);
                                                                                                                                                            updateBetRule(data.amountBet);
                                                                                                                                                                    }
                                                                                                                                                                        });
                                                                                                                                                                        }

                                                                                                                                                                        // --- 2. GAME MECHANICS ---

                                                                                                                                                                        // Helper function: Convert uploaded image to Base64 data so it can be sent over the internet
                                                                                                                                                                        function getBase64(file) {
                                                                                                                                                                            return new Promise((resolve, reject) => {
                                                                                                                                                                                    const reader = new FileReader();
                                                                                                                                                                                            reader.readAsDataURL(file);
                                                                                                                                                                                                    reader.onload = () => resolve(reader.result);
                                                                                                                                                                                                            reader.onerror = error => reject(error);
                                                                                                                                                                                                                });
                                                                                                                                                                                                                }

                                                                                                                                                                                                                // Betting Logic
                                                                                                                                                                                                                document.getElementById('bet-btn').addEventListener('click', async () => {
                                                                                                                                                                                                                    const files = document.getElementById('pic-upload').files;
                                                                                                                                                                                                                        const requiredAmount = lastBetAmount === 0 ? 1 : lastBetAmount + 1;

                                                                                                                                                                                                                            // Enforce your custom rule
                                                                                                                                                                                                                                if (files.length !== requiredAmount) {
                                                                                                                                                                                                                                        alert(`Rule: You must bet exactly ${requiredAmount} picture(s) this turn!`);
                                                                                                                                                                                                                                                return;
                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                        // Convert all selected files
                                                                                                                                                                                                                                                            const base64Images = [];
                                                                                                                                                                                                                                                                for (let file of files) {
                                                                                                                                                                                                                                                                        base64Images.push(await getBase64(file));
                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                // Show images on our screen
                                                                                                                                                                                                                                                                                    displayImages(base64Images);
                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                            // Update the rule for the next person
                                                                                                                                                                                                                                                                                                updateBetRule(files.length);

                                                                                                                                                                                                                                                                                                    // Send the pictures to the other player over WebRTC
                                                                                                                                                                                                                                                                                                        conn.send({
                                                                                                                                                                                                                                                                                                                type: 'BET',
                                                                                                                                                                                                                                                                                                                        images: base64Images,
                                                                                                                                                                                                                                                                                                                                amountBet: files.length
                                                                                                                                                                                                                                                                                                                                    });

                                                                                                                                                                                                                                                                                                                                        // Clear the input
                                                                                                                                                                                                                                                                                                                                            document.getElementById('pic-upload').value = "";
                                                                                                                                                                                                                                                                                                                                            });

                                                                                                                                                                                                                                                                                                                                            function displayImages(imagesArray) {
                                                                                                                                                                                                                                                                                                                                                imagesArray.forEach(imgData => {
                                                                                                                                                                                                                                                                                                                                                        const img = document.createElement('img');
                                                                                                                                                                                                                                                                                                                                                                img.src = imgData;
                                                                                                                                                                                                                                                                                                                                                                        img.className = 'pot-image';
                                                                                                                                                                                                                                                                                                                                                                                potArea.appendChild(img);
                                                                                                                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                    function updateBetRule(amountJustBet) {
                                                                                                                                                                                                                                                                                                                                                                                        lastBetAmount = amountJustBet;
                                                                                                                                                                                                                                                                                                                                                                                            const nextAmount = lastBetAmount + 1;
                                                                                                                                                                                                                                                                                                                                                                                                ruleTracker.innerHTML = `Current rule: You must bet <b>${nextAmount}</b> picture(s).`;
                                                                                                                                                                                                                                                                                                                                                                                                }