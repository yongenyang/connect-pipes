/* game.js
   萊依拉幫學長寫的接水管邏輯（6x6）
   放在同資料夾，直接開 index.html 可玩。
*/

/* 方向編號：0=上, 1=右, 2=下, 3=左 */
/* 方向向量 */
const DIRS = [
  {r:-1,c:0}, // up
  {r:0,c:1},  // right
  {r:1,c:0},  // down
  {r:0,c:-1}, // left
];
const ROWS = 6, COLS = 6;

const boardEl = document.getElementById('board');
const newBtn = document.getElementById('newBtn');
const msgEl = document.getElementById('msg');
const autoSolveCheck = document.getElementById('autoSolveCheck');

let grid = []; // 每格的物件 {r,c, baseConns: Set(direction), rot: 0..3, isStart, isEnd}
let startCell = null, endCell = null;
let solved = false;

// ---------- 產生一個新的關卡 ----------
function newLevel(){
  solved = false;
  boardEl.classList.remove('win');
  msgEl.textContent = '開始新的關卡，點擊方格旋轉（起點/終點不可旋轉）。';

  // 初始化空格資料
  grid = [];
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      grid.push({
        r,c,
        baseConns: new Set(), // 正確方向（未旋轉時）的連線集合
        rot: 0,
        isStart:false, isEnd:false
      });
    }
  }

  // 隨機挑選起點與終點（不同行或不同列）
  const startIdx = Math.floor(Math.random() * grid.length);
  let endIdx;
  do { endIdx = Math.floor(Math.random() * grid.length); } while (endIdx === startIdx);

  startCell = grid[startIdx];
  endCell = grid[endIdx];
  startCell.isStart = true;
  endCell.isEnd = true;

  // 先建構一條從 start 到 end 的隨機簡單路徑（保證可解）
  const path = generatePath(startCell, endCell);

  // 把路徑設定為互相連通（每格只與相鄰路徑格連接）
  for(let i=0;i<path.length;i++){
    const cur = path[i];
    const neighbors = [];
    if(i>0) neighbors.push(path[i-1]);
    if(i<path.length-1) neighbors.push(path[i+1]);
    neighbors.forEach(nb => {
      const dir = directionBetween(cur, nb);
      if(dir >= 0) {
        cur.baseConns.add(dir);
      }
    });
  }
  // 確保 start/end 僅有一個連口（在 path 中已是）
  // 現在為其他格子生成至少兩個連口，並確保互相一致
  fillOtherCellsMutually();

  // 設定每格初始隨機旋轉（起點/終點不旋轉，固定朝向其路徑方向）
  grid.forEach(cell => {
    if(cell.isStart || cell.isEnd){
      cell.rot = 0; // 保持 baseConns 指向路徑方向（不讓玩家旋轉）
    } else {
      cell.rot = Math.floor(Math.random()*4);
    }
  });

  render();
  if(autoSolveCheck.checked) showSolutionHint();
}

// ---------- 產生一條簡單路徑（隨機走動直到到達） ----------
function generatePath(start, end){
  // 使用隨機深度優先嘗試找一條路徑（避免環）
  const visited = new Set();
  const key = (r,c)=> `${r},${c}`;
  const gridMap = {};
  grid.forEach(cell => gridMap[key(cell.r,cell.c)] = cell);

  let found = false;
  let result = [];

  function dfs(cur){
    if(found) return;
    visited.add(key(cur.r,cur.c));
    result.push(cur);
    if(cur === end){
      found = true; return;
    }
    // 隨機排列鄰格順序
    const dirs = [0,1,2,3].sort(()=>Math.random()-0.5);
    for(const d of dirs){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const k = key(nr,nc);
      if(visited.has(k)) continue;
      dfs(gridMap[k]);
      if(found) return;
    }
    // backtrack
    result.pop();
  }

  dfs(start);

  // 若沒有找到路徑（理論上應該找到，但保險起見），用簡單 BFS 建路
  if(!found){
    const parent = {};
    const q = [start];
    const vis = new Set([key(start.r,start.c)]);
    let reached = false;
    while(q.length){
      const cur = q.shift();
      if(cur===end){ reached = true; break; }
      for(let d=0;d<4;d++){
        const nr = cur.r + DIRS[d].r;
        const nc = cur.c + DIRS[d].c;
        if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        const k = key(nr,nc);
        if(vis.has(k)) continue;
        vis.add(k);
        parent[k] = cur;
        q.push(grid.find(g=>g.r===nr && g.c===nc));
      }
    }
    if(reached){
      // reconstruct
      let cur = end;
      const arr = [];
      while(cur && cur!==start){
        arr.push(cur);
        cur = parent[key(cur.r,cur.c)];
      }
      arr.push(start);
      arr.reverse();
      return arr;
    }
    // 若還沒解，回傳直接相鄰假路徑（極不可能）
    return [start,end];
  }

  return result;
}

// ---------- 輔助：計算兩格間方向（從 a 指向 b) ----------
function directionBetween(a,b){
  for(let d=0;d<4;d++){
    if(a.r + DIRS[d].r === b.r && a.c + DIRS[d].c === b.c) return d;
  }
  return -1;
}

// ---------- 為非路徑格子產生隨機連線，並確保互相一致 ----------
function fillOtherCellsMutually(){
  // 先把目前基礎已設定的 direction_要求（來自 path）先保留
  // 然後對所有 cell 隨機分配至少 2 個連口（start/end 保留 1）
  // 過程中若某格因為鄰居已有連口而被迫接回，也會被接受。
  // 最終再一次掃描，確保互相一致（若對方缺少，補上）
  const cellAt = (r,c) => grid.find(g=>g.r===r && g.c===c);

  const indices = grid.map((_,i)=>i).sort(()=>Math.random()-0.5);
  for(const idx of indices){
    const cell = grid[idx];
    if(cell.isStart || cell.isEnd) continue; // start/end 已由 path 決定
    // 計算已被鄰居要求連回的方向（鄰居 baseConns 包含到自己的方向）
    const forced = new Set();
    for(let d=0;d<4;d++){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = cellAt(nr,nc);
      // 如果鄰格已經有 baseConns 指向這格，必須回應
      const opp = (d+2)%4;
      if(nb.baseConns.has(opp)){
        forced.add(d);
      }
    }
    // 決定總共要有多少連口（至少 forced.size，但至少2）
    const needAtLeast = Math.max(2, forced.size);
    const choices = [];
    for(let d=0;d<4;d++){
      if(!forced.has(d)) choices.push(d);
    }
    // 隨機選擇補足的方向
    while(cell.baseConns.size < needAtLeast){
      if(choices.length===0) break;
      const pickIdx = Math.floor(Math.random()*choices.length);
      const d = choices.splice(pickIdx,1)[0];
      cell.baseConns.add(d);
    }
    // 把 forced 方向也加入
    forced.forEach(d=>cell.baseConns.add(d));
  }

  // 最後一次掃描，確保互相一致（如果 A 有朝 B 的連口，而 B 未有朝 A，則把 B 加上朝 A）
  for(const cell of grid){
    for(const d of Array.from(cell.baseConns)){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      const opp = (d+2)%4;
      if(!nb.baseConns.has(opp)){
        nb.baseConns.add(opp);
      }
    }
  }

  // 最後檢查 start/end 是否確實只有1個連口；若鄰居在補互相一致時多補了，修正（保留 path 設定）
  // 先重設 start/end 為 path 的連口（確保唯一）
  // 找 path neighbor
  // start: 找其在 baseConns 指向的 neighbor（必有一個）
  [startCell, endCell].forEach(cell=>{
    // 只要保留與路徑相鄰的方向，移除其他方向
    const keep = new Set();
    // 掃過四個方向，若鄰居對應方向雙向連結且那鄰居在 path，保留
    for(let d=0;d<4;d++){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      // 若 nb 已對 cell 有連線，且 nb 與 cell 互為 path 相鄰 => keep
      if(nb.baseConns.has((d+2)%4)){
        // 為了保證唯一，記錄為可能保留
        keep.add(d);
      }
    }
    // 若沒有找到（極少），則任意選一個鄰格並建立連線
    if(keep.size===0){
      for(let d=0;d<4;d++){
        const nr = cell.r + DIRS[d].r;
        const nc = cell.c + DIRS[d].c;
        if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        keep.add(d); break;
      }
    }
    // 把 start/end 只有這些連口（選第一個）
    const first = Array.from(keep)[0];
    cell.baseConns.clear();
    cell.baseConns.add(first);
    // 確保鄰居有回應
    const nb = grid.find(g=>g.r===cell.r + DIRS[first].r && g.c===cell.c + DIRS[first].c);
    if(nb && !nb.baseConns.has((first+2)%4)){
      nb.baseConns.add((first+2)%4);
    }
  });
}

// ---------- 渲染整個棋盤 ----------
function render(){
  boardEl.innerHTML = '';
  for(const cell of grid){
    const el = document.createElement('button');
    el.className = 'cell' + (cell.isStart||cell.isEnd ? ' locked' : '');
    el.dataset.r = cell.r; el.dataset.c = cell.c;
    // 起點/終點標記
    if(cell.isStart){
      const mark = document.createElement('span');
      mark.className = 'marker start';
      mark.textContent = 'S';
      el.appendChild(mark);
    } else if(cell.isEnd){
      const mark = document.createElement('span');
      mark.className = 'marker end';
      mark.textContent = 'E';
      el.appendChild(mark);
    }

    // 建立 SVG，根據 baseConns 畫出各個方向的線段（再透過 transform rotate 顯示旋轉）
    const svg = createPipeSVG(cell);
    // 設定 transform 根據 rot
    svg.style.transform = `rotate(${cell.rot * 90}deg)`;
    el.appendChild(svg);

    // 事件：點擊旋轉（若非起/終點）
    if(!cell.isStart && !cell.isEnd){
      el.addEventListener('click', ()=>{
        if(solved) return;
        cell.rot = (cell.rot + 1) % 4;
        svg.style.transform = `rotate(${cell.rot * 90}deg)`;
        checkSolved();
      });
    }

    boardEl.appendChild(el);
  }
  // 若已勾選顯示解法，標示
  if(autoSolveCheck.checked){
    showSolutionHint();
  } else {
    clearSolutionHint();
  }
}

// ---------- 根據 cell.baseConns 建構一個 SVG 圖形（中心為圓，朝四邊伸線） ----------
function createPipeSVG(cell){
  // SVG viewBox 0 0 100 100，中心位置 50,50，線延伸到四個方向
  // 線寬和圓心略微設計
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('aria-hidden','true');

  // 背景（透明）
  const g = document.createElementNS(ns,'g');

  // draw center circle (pipe joint)
  const center = document.createElementNS(ns,'circle');
  center.setAttribute('cx','50'); center.setAttribute('cy','50'); center.setAttribute('r','12');
  center.setAttribute('fill','#cfe7ff');
  center.setAttribute('stroke','#2b8cff');
  center.setAttribute('stroke-width','4');
  g.appendChild(center);

  // draw each direction line if baseConns has it (we draw unrotated base; rotation applied to svg element)
  const lineSpec = {
    0: {x1:50,y1:10,x2:50,y2:50}, // up
    1: {x1:50,y1:50,x2:90,y2:50}, // right
    2: {x1:50,y1:50,x2:50,y2:90}, // down
    3: {x1:10,y1:50,x2:50,y2:50}, // left
  };
  for(const d of cell.baseConns){
    const ln = document.createElementNS(ns,'line');
    ln.setAttribute('x1', lineSpec[d].x1);
    ln.setAttribute('y1', lineSpec[d].y1);
    ln.setAttribute('x2', lineSpec[d].x2);
    ln.setAttribute('y2', lineSpec[d].y2);
    ln.setAttribute('stroke','#2b8cff');
    ln.setAttribute('stroke-width','12');
    ln.setAttribute('stroke-linecap','round');
    g.appendChild(ln);
  }

  // 如果是 start/end 加上小箭頭或顏色加強
  if(cell.isStart){
    center.setAttribute('fill','#2ecc71');
    center.setAttribute('stroke','#27ae60');
  } else if(cell.isEnd){
    center.setAttribute('fill','#ff6b6b');
    center.setAttribute('stroke','#e05555');
  }

  svg.appendChild(g);
  return svg;
}

// ---------- 檢查目前狀態是否通路（考慮每格旋轉後的實際連線） ----------
function checkSolved(){
  const reachable = bfsFromStart();
  // 如果 end 能被到達，過關
  if(reachable.has(cellKey(endCell))){
    solved = true;
    msgEl.textContent = '恭喜過關！起點已連通到終點～';
    boardEl.classList.add('win');
    // 標示所有在解中格子（若要）
    highlightSolutionPath(reachable);
  } else {
    msgEl.textContent = '還沒通，繼續轉轉看吧。';
    boardEl.classList.remove('win');
    if(autoSolveCheck.checked) showSolutionHint();
    else clearSolutionHint();
  }
}

// ---------- BFS：從 start 出發，沿著實際有效連線走，回傳可達集合並保留 parent 做路徑還原 ----------
function bfsFromStart(){
  const gridMap = {};
  grid.forEach(cell=> gridMap[cellKey(cell)] = cell);
  const startKey = cellKey(startCell);
  const q = [startCell];
  const vis = new Set([startKey]);
  const parent = {};
  while(q.length){
    const cur = q.shift();
    const curKey = cellKey(cur);
    const curConns = effectiveConns(cur); // 回傳 Set of directions that are currently朝向(0..3)
    for(const d of curConns){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      if(!nb) continue;
      // neighbor must also have reciprocal connection
      const opp = (d+2)%4;
      const nbConns = effectiveConns(nb);
      if(!nbConns.has(opp)) continue;
      const nbKey = cellKey(nb);
      if(!vis.has(nbKey)){
        vis.add(nbKey);
        parent[nbKey] = curKey;
        q.push(nb);
      }
    }
  }
  // attach parent map for possible path highlight
  bfsParentMap = parent;
  return vis;
}
let bfsParentMap = {}; // 用於路徑還原顯示

// ---------- 計算 cell 在當前 rot 下的實際連線（Set of directions） ----------
function effectiveConns(cell){
  // 設 baseConns 是未旋轉的方向集合，若旋轉 rot，實際方向為 (d + rot) % 4
  const set = new Set();
  for(const d of cell.baseConns){
    const eff = (d + cell.rot) % 4;
    set.add(eff);
  }
  return set;
}

function cellKey(cell){ return `${cell.r},${cell.c}`; }

// ---------- 顯示解法提示（若勾選） ----------
function showSolutionHint(){
  // 利用 BFS 找到所有可達格，然後從 end 反推 parent 還原出一條路徑（若 end 可達）
  const reachable = bfsFromStart();
  clearSolutionHint();
  if(reachable.has(cellKey(endCell))){
    // 若已可達，就把整條實際路徑標示
    let curKey = cellKey(endCell);
    while(curKey && curKey !== cellKey(startCell)){
      const [r,c] = curKey.split(',').map(Number);
      const idx = grid.findIndex(g=>g.r===r && g.c===c);
      if(idx>=0){
        boardEl.children[idx].classList.add('path-hint');
      }
      curKey = bfsParentMap[curKey];
    }
    // 標 start
    const sidx = grid.findIndex(g=>g===startCell);
    if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
  } else {
    // 若不可達，嘗試用已生成之 base 解（不考慮旋轉）來顯示存在的基礎路徑
    // 但我們已保證存在一條 base 路徑；這邊可以顯示該 base 路徑（不一定對玩家有用）
    // 簡單做法：標示 path cells（baseConns 與 path 關係）
    // 先找 path via baseConns BFS (不考慮 rot)
    const baseVis = new Set();
    const q = [startCell];
    baseVis.add(cellKey(startCell));
    const parent = {};
    while(q.length){
      const cur = q.shift();
      for(const d of cur.baseConns){
        const nr = cur.r + DIRS[d].r;
        const nc = cur.c + DIRS[d].c;
        if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        const nb = grid.find(g=>g.r===nr && g.c===nc);
        const opp = (d+2)%4;
        if(!nb.baseConns.has(opp)) continue;
        const k = cellKey(nb);
        if(!baseVis.has(k)){
          baseVis.add(k);
          parent[k] = cellKey(cur);
          q.push(nb);
        }
      }
    }
    // 如果 end 被 baseVis 包含，標示從 end 回 start 的 base 路徑
    if(baseVis.has(cellKey(endCell))){
      let curKey = cellKey(endCell);
      while(curKey && curKey !== cellKey(startCell)){
        const [r,c] = curKey.split(',').map(Number);
        const idx = grid.findIndex(g=>g.r===r && g.c===c);
        if(idx>=0){
          boardEl.children[idx].classList.add('path-hint');
        }
        curKey = parent[curKey];
      }
      const sidx = grid.findIndex(g=>g===startCell);
      if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
    }
  }
}

// ---------- 清除提示樣式 ----------
function clearSolutionHint(){
  Array.from(boardEl.children).forEach(ch => ch.classList.remove('path-hint'));
}

// ---------- 標示正確已連通之路徑（在過關時） ----------
function highlightSolutionPath(reachable){
  clearSolutionHint();
  // 使用 bfsParentMap（從 bfsFromStart 產生）
  let curKey = cellKey(endCell);
  while(curKey && curKey !== cellKey(startCell)){
    const [r,c] = curKey.split(',').map(Number);
    const idx = grid.findIndex(g=>g.r===r && g.c===c);
    if(idx>=0) boardEl.children[idx].classList.add('path-hint');
    curKey = bfsParentMap[curKey];
  }
  const sidx = grid.findIndex(g=>g===startCell);
  if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
}

// ---------- 綁定按鈕事件 ----------
newBtn.addEventListener('click', ()=>{ newLevel(); });
autoSolveCheck.addEventListener('change', ()=>{
  if(autoSolveCheck.checked) showSolutionHint();
  else clearSolutionHint();
});

// ---------- 初始化第一關 ----------
newLevel();

// 檢查初始是否已過關（極端情況）
checkSolved();