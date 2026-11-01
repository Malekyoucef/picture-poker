let peer, conn;
let myRole = null; 
let myName = "Player", oppName = "Opponent";

let gameState = { phase: 0, turn: 'none', hostBetPhase: 0, joinerBetPhase: 0, hostActed: false, joinerActed: false, winner: null, actionMsg: "Game starting..." };

let myHand = [], communityCards = [], secretPot = [];
let hostKnownJoinerHand = []; // The Host tracks both hands secretly to evaluate at the end

const suits = ['♥', '♦', '♠', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const ROOM_PREFIX = "picture-poker-v4-";

// --- 1. SETUP ---
document.getElementById('host-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value || "Host";
    const code = document.getElementById('room-code').value.toUpperCase().trim();
    if (!code) return alert("Enter Room Code!");
    myRole = 'host';
    peer = new Peer(ROOM_PREFIX + code);
    peer.on('open', () => document.getElementById('status-msg').innerHTML = `Table Created! Friend joins with code <b>${code}</b>...`);
    peer.on('connection', (connection) => {
        conn = connection;
        setupUI();
        conn.on('data', handleNetworkData);
        setTimeout(startNewHand, 1000); 
    });
});

document.getElementById('join-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value || "Player 2";
    const code = document.getElementById('room-code').value.toUpperCase().trim();
    if (!code) return alert("Enter Room Code!");
    myRole = 'joiner';
    document.getElementById('status-msg').innerText = "Connecting...";
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect(ROOM_PREFIX + code);
        conn.on('open', () => { setupUI(); conn.on('data', handleNetworkData); });
    });
});

function setupUI() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    document.getElementById('my-name-display').innerText = myName;
    conn.send({ type: 'INFO', name: myName });
}

// --- 2. HOST AUTOMATION & POKER MATH ---
function createDeck() {
    let deck = [];
    for (let suit of suits) for (let value of values) deck.push({ value, suit, color: (suit === '♥' || suit === '♦') ? 'red' : 'black' });
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function startNewHand() {
    let deck = createDeck();
    myHand = [deck.pop(), deck.pop()];
    hostKnownJoinerHand = [deck.pop(), deck.pop()];
    communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    secretPot = [];
    
    gameState = { phase: 0, turn: 'host', hostBetPhase: 0, joinerBetPhase: 0, hostActed: false, joinerActed: false, winner: null, actionMsg: "New hand dealt. Host goes first." };
    conn.send({ type: 'DEAL', hand: hostKnownJoinerHand, community: communityCards });
    syncState();
}

function syncState() {
    conn.send({ type: 'STATE', state: gameState });
    renderGame();
}

function checkPhaseAdvance() {
    if (gameState.hostActed && gameState.joinerActed && gameState.hostBetPhase === gameState.joinerBetPhase) {
        gameState.phase++;
        gameState.hostBetPhase = 0;
        gameState.joinerBetPhase = 0;
        gameState.hostActed = false;
        gameState.joinerActed = false;
        gameState.turn = 'host'; 
        gameState.actionMsg = `Phase advanced. Host's turn.`;

        // AUTOMATIC SHOWDOWN JUDGING
        if (gameState.phase > 3) {
            gameState.phase = 4;
            gameState.turn = 'none';
            
            // Reveal both hands
            gameState.revealedHostHand = myHand;
            gameState.revealedJoinerHand = hostKnownJoinerHand;

            // Evaluate who mathematically won
            const hostScore = evaluateHand([...myHand, ...communityCards]);
            const joinerScore = evaluateHand([...hostKnownJoinerHand, ...communityCards]);
            
            const cmp = compareScores(hostScore.score, joinerScore.score);
            if (cmp > 0) {
                gameState.winner = 'host';
                gameState.actionMsg = `Showdown: Host wins with a ${hostScore.name}!`;
            } else if (cmp < 0) {
                gameState.winner = 'joiner';
                gameState.actionMsg = `Showdown: ${oppName} wins with a ${joinerScore.name}!`;
            } else {
                gameState.winner = 'tie';
                gameState.actionMsg = `Showdown: It's a Tie! Both have ${hostScore.name}!`;
            }
        }
    } else {
        gameState.turn = (gameState.turn === 'host') ? 'joiner' : 'host';
    }
    syncState();
}

// --- 3. POKER ALGORITHM ---
function evaluateHand(cards) {
    const valMap = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
    let bestScore = [-1], bestName = "";
    
    // Gets all 21 combinations of 5 cards from your 7 available cards
    const combos = getCombinations(cards, 5);
    for(let combo of combos) {
        let counts = {}, suits = {};
        combo.forEach(c => {
            let v = valMap[c.value];
            counts[v] = (counts[v] || 0) + 1;
            suits[c.suit] = (suits[c.suit] || 0) + 1;
        });
        
        let flush = Object.keys(suits).length === 1;
        let sortedVals = Object.keys(counts).map(Number).sort((a,b) => a-b);
        let isStraight = sortedVals.length === 5 && sortedVals[4] - sortedVals[0] === 4;
        
        if(sortedVals.length === 5 && sortedVals.join(',') === '2,3,4,5,14') isStraight = true; // A-2-3-4-5 rule
        
        let freqs = [];
        for(let v in counts) freqs.push([counts[v], Number(v)]);
        freqs.sort((a,b) => b[0] !== a[0] ? b[0] - a[0] : b[1] - a[1]); // Sort by frequency, then highest card
        
        let rank = 0, name = "High Card";
        if(isStraight && flush) { rank = 8; name = "Straight Flush"; }
        else if(freqs[0][0] === 4) { rank = 7; name = "Four of a Kind"; }
        else if(freqs[0][0] === 3 && freqs[1][0] === 2) { rank = 6; name = "Full House"; }
        else if(flush) { rank = 5; name = "Flush"; }
        else if(isStraight) { rank = 4; name = "Straight"; }
        else if(freqs[0][0] === 3) { rank = 3; name = "Three of a Kind"; }
        else if(freqs[0][0] === 2 && freqs[1][0] === 2) { rank = 2; name = "Two Pair"; }
        else if(freqs[0][0] === 2) { rank = 1; name = "Pair"; }

        let score = [rank];
        if (isStraight && sortedVals.join(',') === '2,3,4,5,14') score.push(5,4,3,2,1); // Low Ace
        else freqs.forEach(f => { for(let i=0; i<f[0]; i++) score.push(f[1]); });
        
        if (compareScores(score, bestScore) > 0) { bestScore = score; bestName = name; }
    }
    return { score: bestScore, name: bestName };
}

function getCombinations(arr, k) {
    if (k > arr.length || k <= 0) return [];
    if (k == arr.length) return [arr];
    if (k == 1) return arr.map(a => [a]);
    let combs = [];
    for (let i = 0; i < arr.length - k + 1; i++) {
        let head = arr.slice(i, i + 1);
        let tailcombs = getCombinations(arr.slice(i + 1), k - 1);
        for (let j = 0; j < tailcombs.length; j++) combs.push(head.concat(tailcombs[j]));
    }
    return combs;
}

function compareScores(s1, s2) {
    for(let i=0; i<Math.max(s1.length, s2.length); i++) {
        if((s1[i]||0) !== (s2[i]||0)) return (s1[i]||0) - (s2[i]||0);
    }
    return 0;
}

// --- 4. NETWORK SYNC ---
function handleNetworkData(data) {
    if (data.type === 'INFO') {
        oppName = data.name;
        document.getElementById('opp-name-display').innerText = oppName;
    }
    else if (data.type === 'DEAL') {
        myHand = data.hand;
        communityCards = data.community;
        secretPot = [];
    }
    else if (data.type === 'STATE') {
        gameState = data.state;
        renderGame();
    }
    else if (data.type === 'PICS') {
        secretPot.push(...data.images);
        renderGame();
    }
    else if (data.type === 'ACTION' && myRole === 'host') {
        if (data.action === 'FOLD') {
            gameState.winner = 'host';
            gameState.phase = 4;
            gameState.turn = 'none';
            gameState.actionMsg = `${oppName} Folded. Host wins!`;
            syncState();
        } else {
            gameState.joinerBetPhase += data.count;
            gameState.joinerActed = true;
            gameState.actionMsg = data.count === 0 ? `${oppName} Checked/Called.` : `${oppName} Raised ${data.count} pics.`;
            checkPhaseAdvance();
        }
    }
}

// --- 5. PLAYER CONTROLS ---
document.getElementById('btn-next-hand').addEventListener('click', startNewHand);

document.getElementById('btn-submit-action').addEventListener('click', async () => {
    const files = document.getElementById('pic-upload').files;
    const myBet = myRole === 'host' ? gameState.hostBetPhase : gameState.joinerBetPhase;
    const oppBet = myRole === 'host' ? gameState.joinerBetPhase : gameState.hostBetPhase;
    const needed = Math.max(0, oppBet - myBet);

    if (files.length < needed) return alert(`You must upload at least ${needed} picture(s) to match the bet!`);

    let base64s = [];
    for (let f of files) base64s.push(await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f); }));
    
    if (base64s.length > 0) secretPot.push(...base64s);
    document.getElementById('pic-upload').value = ""; 

    if (myRole === 'host') {
        gameState.hostBetPhase += base64s.length;
        gameState.hostActed = true;
        gameState.actionMsg = base64s.length === 0 ? "Host Checked/Called." : `Host Raised ${base64s.length} pics.`;
        if (base64s.length > 0) conn.send({ type: 'PICS', images: base64s });
        checkPhaseAdvance();
    } else {
        conn.send({ type: 'ACTION', action: 'PLAY', count: base64s.length });
        if (base64s.length > 0) conn.send({ type: 'PICS', images: base64s });
    }
});

document.getElementById('btn-fold').addEventListener('click', () => {
    if (myRole === 'host') {
        gameState.winner = 'joiner';
        gameState.phase = 4;
        gameState.turn = 'none';
        gameState.actionMsg = "Host Folded. Player 2 wins!";
        syncState();
    } else conn.send({ type: 'ACTION', action: 'FOLD' });
});

document.getElementById('btn-claim-win').addEventListener('click', () => {
    document.getElementById('hidden-pot-area').innerHTML = ""; 
    const revealDiv = document.getElementById('revealed-pot-area');
    revealDiv.innerHTML = "";
    secretPot.forEach(imgData => {
        const img = document.createElement('img'); img.src = imgData; img.className = 'revealed-pic';
        revealDiv.appendChild(img);
    });
    document.getElementById('btn-claim-win').style.display = 'none';
});

// --- 6. RENDER ENGINE ---
function createCardHTML(card, isHidden) {
    if (isHidden) return `<div class="card hidden">?</div>`;
    return `<div class="card ${card.color}"><div>${card.value}</div><div>${card.suit}</div></div>`;
}

function renderGame() {
    document.getElementById('opp-action-text').innerText = gameState.actionMsg;
    
    // My Cards
    if (myHand.length > 0) document.getElementById('my-hand').innerHTML = myHand.map(c => createCardHTML(c, false)).join('');
    
    // Opponent Cards (Hidden until showdown)
    const oppHandDiv = document.getElementById('opp-hand');
    if (gameState.phase < 4 || !gameState.revealedHostHand) {
        oppHandDiv.innerHTML = `<div class="card hidden">?</div><div class="card hidden">?</div>`;
    } else {
        const oppCards = myRole === 'host' ? gameState.revealedJoinerHand : gameState.revealedHostHand;
        oppHandDiv.innerHTML = oppCards.map(c => createCardHTML(c, false)).join('');
    }

    // Community Cards
    if (communityCards.length > 0) {
        let commHtml = "";
        for (let i = 0; i < 5; i++) {
            let isHidden = true;
            if (gameState.phase >= 1 && i <= 2) isHidden = false; // Flop
            if (gameState.phase >= 2 && i === 3) isHidden = false; // Turn
            if (gameState.phase >= 3 && i === 4) isHidden = false; // River
            commHtml += createCardHTML(communityCards[i], isHidden);
        }
        document.getElementById('community-cards').innerHTML = commHtml;
    }

    // Pot UI
    document.getElementById('pot-count').innerText = secretPot.length;
    document.getElementById('revealed-pot-area').innerHTML = "";
    let hiddenHtml = "";
    for(let i=0; i<secretPot.length; i++) hiddenHtml += `<div class="hidden-pic">?</div>`;
    document.getElementById('hidden-pot-area').innerHTML = hiddenHtml;

    // Turn Control & Buttons
    const myArea = document.getElementById('my-area'), oppArea = document.getElementById('opponent-area');
    const controls = document.getElementById('controls-container'), btnClaimWin = document.getElementById('btn-claim-win');
    const hostNextBtn = document.getElementById('host-controls');
    
    myArea.classList.remove('active-turn'); oppArea.classList.remove('active-turn');
    controls.style.display = 'none'; btnClaimWin.style.display = 'none'; hostNextBtn.style.display = 'none';

    if (gameState.phase < 4) {
        if (gameState.turn === myRole) {
            myArea.classList.add('active-turn'); controls.style.display = 'block';
            document.getElementById('my-action-text').innerText = "YOUR TURN";
            
            const myBet = myRole === 'host' ? gameState.hostBetPhase : gameState.joinerBetPhase;
            const oppBet = myRole === 'host' ? gameState.joinerBetPhase : gameState.hostBetPhase;
            const diff = Math.max(0, oppBet - myBet);
            document.getElementById('call-instruction').innerText = diff > 0 ? `To Call: You must upload at least ${diff} picture(s)` : `To Check: Submit 0 pictures. To Raise: Upload pictures.`;
        } else {
            oppArea.classList.add('active-turn'); document.getElementById('my-action-text').innerText = "Waiting for opponent...";
        }
    } else {
        document.getElementById('my-action-text').innerText = "Hand Over.";
        if (myRole === 'host') hostNextBtn.style.display = 'block'; 
        
        if (gameState.winner === myRole) {
            btnClaimWin.style.display = 'block';
            btnClaimWin.innerText = "🏆 I Won! (Reveal Pot)";
        } else if (gameState.winner === 'tie') {
            btnClaimWin.style.display = 'block';
            btnClaimWin.innerText = "🤝 Tie! (Reveal Pot)";
        }
    }
}