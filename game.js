/* game.js - 6x6 接水管（非四通）版本
   要求：
   - 6x6 盤面，任意選兩格為起點/終點（僅單口）
   - 其他格子必須是二或三口（直管/彎管/T形）
   - 隨機生成一條保證可解的路徑，然後填滿其餘格子（互相一致）
   - 開始時隨機旋轉（起終點固定方向）
   - 玩家點擊（非起終點）旋轉 90 度，連通即可過關
*/

const DIRS = [
  {r:-1,c:0}, // 0 up
  {r:0,c:1},  // 1 right
  {r:1,c:0},  // 2 down
  {r:0,c:-1}, // 3 left
];
const ROWS = 6, COLS = 6;

const boardEl = document.getElementById('board');
const newBtn = document.getElementById('newBtn');
const msgEl = document.getElementById('msg');
const autoSolveCheck = document.getElementById('autoSolveCheck');

let grid = []; // cell objects
let startCell = null, endCell = null;
let solved = false;
let bfsParentMap = {};

// ---------- 新關 ----------
function newLevel(){
  solved = false;
  boardEl.classList.remove('win');
  msgEl.textContent = '新的關卡已產生：點擊方格旋轉（起點/終點不可旋轉）。';

  // 初始化格子
  grid = [];
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      grid.push({
        r,c,
        baseConns: new Set(), // 未旋轉下的連口方向集合
        rot: 0,
        isStart:false, isEnd:false
      });
    }
  }

  // 選起點與終點（不同格）
  const startIdx = Math.floor(Math.random() * grid.length);
  let endIdx;
  do { endIdx = Math.floor(Math.random() * grid.length); } while (endIdx === startIdx);
  startCell = grid[startIdx]; endCell = grid[endIdx];
  startCell.isStart = true; endCell.isEnd = true;

  // 產生一條 path（保證）
  const path = generatePath(startCell, endCell);

  // 設定 path 上每格的 baseConns (和相鄰 path 相連)
  for(let i=0;i<path.length;i++){
    const cur = path[i];
    cur.baseConns.clear();
    if(i>0){
      const prev = path[i-1];
      cur.baseConns.add(directionBetween(cur, prev)); // note: this adds direction from cur -> prev
    }
    if(i<path.length-1){
      const next = path[i+1];
      cur.baseConns.add(directionBetween(cur, next));
    }
    // 路徑上的格子若只有兩個相反方向（直管）或兩個相鄰（彎管)，都合法
    // start/end 保持單口（稍後會修正）
  }

  // 強制 start/end 為單口：確保它們只有連向 path 的一個方向
  enforceEndpointSingleConnection(startCell, path);
  enforceEndpointSingleConnection(endCell, path);

  // 填滿其它格子，使其有 2 或 3 個連口，並確保互相一致（互相回連）
  fillOtherCellsMutually_NoFour();

  // 隨機旋轉每格（但不旋轉起點/終點，起終點保持朝向其唯一連口）
  grid.forEach(cell => {
    if(cell.isStart || cell.isEnd){
      cell.rot = 0;
    } else {
      cell.rot = Math.floor(Math.random()*4);
    }
  });

  render();
  if(autoSolveCheck.checked) showSolutionHint();
}

// ---------- 產生 path（用 DFS 或 BFS） ----------
function generatePath(start, end){
  // 使用隨機 DFS 找一條簡單路徑（避免環）
  const key = (r,c)=> `${r},${c}`;
  const gridMap = {};
  grid.forEach(cell => gridMap[key(cell.r,cell.c)] = cell);
  const visited = new Set();
  let found = false;
  let result = [];

  function dfs(cur){
    if(found) return;
    visited.add(key(cur.r,cur.c));
    result.push(cur);
    if(cur === end){ found = true; return; }
    const dirs = [0,1,2,3].sort(()=>Math.random()-0.5);
    for(const d of dirs){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = gridMap[key(nr,nc)];
      if(visited.has(key(nb.r,nb.c))) continue;
      dfs(nb);
      if(found) return;
    }
    result.pop();
  }

  dfs(start);

  if(found) return result;

  // 萬一沒找到（理論上不會），用 BFS 重建最短路徑
  const parent = {};
  const q = [start];
  const vis = new Set([key(start.r,start.c)]);
  let reached = false;
  while(q.length){
    const cur = q.shift();
    if(cur === end){ reached = true; break; }
    for(let d=0;d<4;d++){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      const k = key(nr,nc);
      if(vis.has(k)) continue;
      vis.add(k);
      parent[k] = cur;
      q.push(nb);
    }
  }
  if(reached){
    let cur = end;
    const arr = [];
    while(cur && cur!==start){
      arr.push(cur);
      const pk = key(cur.r,cur.c);
      cur = parent[pk];
    }
    arr.push(start);
    arr.reverse();
    return arr;
  }
  // fallback
  return [start,end];
}

// ---------- 計算 a 指向 b 的方向（0..3） ----------
function directionBetween(a,b){
  for(let d=0; d<4; d++){
    if(a.r + DIRS[d].r === b.r && a.c + DIRS[d].c === b.c) return d;
  }
  return -1;
}

// ---------- 確保起點/終點為單口（保留 path 鄰居） ----------
function enforceEndpointSingleConnection(pt, path){
  // 找 path 中與 pt 相鄰的那個格子（如果有）
  for(const nb of path){
    if(nb === pt) continue;
    const d = directionBetween(pt, nb);
    if(d>=0){
      pt.baseConns.clear();
      pt.baseConns.add(d);
      // 確保鄰居也有回連
      const opp = (d+2)%4;
      if(!nb.baseConns.has(opp)) nb.baseConns.add(opp);
      return;
    }
  }
  // 如果沒找到（不太可能），隨機選一個鄰格建立關係
  for(let d=0;d<4;d++){
    const nr = pt.r + DIRS[d].r;
    const nc = pt.c + DIRS[d].c;
    if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
    const nb = grid.find(g=>g.r===nr && g.c===nc);
    pt.baseConns.clear();
    pt.baseConns.add(d);
    if(nb && !nb.baseConns.has((d+2)%4)) nb.baseConns.add((d+2)%4);
    return;
  }
}

// ---------- 填充其他格子，確保每格為 2 或 3 個連口，且互相一致（禁止四通） ----------
function fillOtherCellsMutually_NoFour(){
  const cellAt = (r,c) => grid.find(g=>g.r===r && g.c===c);

  // 先處理所有非 start/end 格子
  const indices = grid.map((_,i)=>i).sort(()=>Math.random()-0.5);
  for(const idx of indices){
    const cell = grid[idx];
    if(cell.isStart || cell.isEnd) continue;

    // 先保留鄰居已要求的連回方向（forced）
    const forced = new Set();
    for(let d=0; d<4; d++){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = cellAt(nr,nc);
      if(nb.baseConns.has((d+2)%4)){
        forced.add(d);
      }
    }

    // 決定目標連口數：若 forced.size >= 3 -> 目標 = forced.size (最多 3)
    // 否則隨機選2或3（機率偏向2）
    let target;
    if(forced.size >= 3) target = Math.min(3, forced.size);
    else target = (Math.random() < 0.7) ? 2 : 3;

    // 將 forced 加入
    const candidates = new Set(forced);
    // 如果需要補足，再從可選方向隨機挑選，避免產生四通
    const avail = [];
    for(let d=0; d<4; d++){
      if(!candidates.has(d)) avail.push(d);
    }
    while(candidates.size < target && avail.length > 0){
      const pickIdx = Math.floor(Math.random() * avail.length);
      candidates.add(avail[pickIdx]);
      avail.splice(pickIdx,1);
    }

    // 如果有可能 candidates 包含 4 個（極少），隨機去掉一個使其變 3
    if(candidates.size > 3){
      const arr = Array.from(candidates);
      const removeIdx = Math.floor(Math.random() * arr.length);
      candidates.delete(arr[removeIdx]);
    }

    // 設定 cell.baseConns
    cell.baseConns = new Set(Array.from(candidates));
  }

  // 最後一次掃描，確保互相一致：若 A 有指向 B，但 B 沒有回連，則補上 B，但要避免造成 B 四通
  for(const cell of grid){
    for(const d of Array.from(cell.baseConns)){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = cellAt(nr,nc);
      const opp = (d+2)%4;
      if(!nb.baseConns.has(opp)){
        // 若 nb 原本三個連口，不能再加（避免變四通），則嘗試調整 cell（移除此方向）或替換另一方向
        if(nb.baseConns.size >= 3){
          // 尝试把 cell 移除该方向（如果 cell 仍然 ≥2）
          if(cell.baseConns.size > 2){
            cell.baseConns.delete(d);
          } else {
            // 否則，嘗試從 nb 找出可替代方向（非 cell 方向）並加上
            for(let alt=0; alt<4; alt++){
              if(alt === opp) continue;
              const ar = nb.r + DIRS[alt].r;
              const ac = nb.c + DIRS[alt].c;
              if(ar<0||ar>=ROWS||ac<0||ac>=COLS) continue;
              const other = cellAt(ar,ac);
              const opp2 = (alt+2)%4;
              if(!nb.baseConns.has(alt) && (!other || !other.baseConns.has(opp2) || other.baseConns.size < 3)){
                nb.baseConns.add(alt);
                if(other) other.baseConns.add(opp2);
                nb.baseConns.add(opp); // then ensure back
                break;
              }
            }
            // 最後仍嘗試加回（若沒辦法，可能會產生短暫不一致，但後面會再修）
            nb.baseConns.add(opp);
          }
        } else {
          nb.baseConns.add(opp);
        }
      }
    }
  }

  // 再次檢查並修正：確保每格非 start/end 至少有 2 且至多 3，若某格 <2，補方向；若 >3，隨機移除到 3
  for(const cell of grid){
    if(cell.isStart || cell.isEnd) continue;
    while(cell.baseConns.size < 2){
      const choices = [];
      for(let d=0; d<4; d++){
        if(!cell.baseConns.has(d)) choices.push(d);
      }
      if(choices.length === 0) break;
      const pick = choices[Math.floor(Math.random()*choices.length)];
      cell.baseConns.add(pick);
      // 確保鄰居回連（但勿讓鄰居超過3）
      const nb = cellAt(cell.r + DIRS[pick].r, cell.c + DIRS[pick].c);
      if(nb && !nb.baseConns.has((pick+2)%4) && !nb.isStart && !nb.isEnd){
        if(nb.baseConns.size < 3) nb.baseConns.add((pick+2)%4);
      }
    }
    if(cell.baseConns.size > 3){
      // 刪到 3
      const arr = Array.from(cell.baseConns);
      while(cell.baseConns.size > 3){
        const rem = arr.pop();
        cell.baseConns.delete(rem);
        // 也刪掉鄰居的回連
        const nb = cellAt(cell.r + DIRS[rem].r, cell.c + DIRS[rem].c);
        if(nb) nb.baseConns.delete((rem+2)%4);
      }
    }
  }

  // 確保 start/end 仍然只有一個連口
  // 如果在修改過程中被多加了，修回只保留與 path 的連口（或任一一個）
  [startCell, endCell].forEach(cell=>{
    if(!cell) return;
    if(cell.baseConns.size === 1) return;
    // 優先保留與 path 鄰居相連的方向
    let keep = null;
    for(const d of Array.from(cell.baseConns)){
      const nr = cell.r + DIRS[d].r;
      const nc = cell.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = cellAt(nr,nc);
      // 若鄰居也有回連，選這個
      if(nb && nb.baseConns.has((d+2)%4)){
        keep = d; break;
      }
    }
    if(keep === null) keep = Array.from(cell.baseConns)[0];
    cell.baseConns.clear();
    cell.baseConns.add(keep);
    // 確保鄰居回連
    const nb = cellAt(cell.r + DIRS[keep].r, cell.c + DIRS[keep].c);
    if(nb && !nb.baseConns.has((keep+2)%4)) nb.baseConns.add((keep+2)%4);
  });
}

// ---------- 渲染 ----------
function render(){
  boardEl.innerHTML = '';
  for(const cell of grid){
    const btn = document.createElement('button');
    btn.className = 'cell' + (cell.isStart || cell.isEnd ? ' locked' : '');
    btn.dataset.r = cell.r; btn.dataset.c = cell.c;

    if(cell.isStart){
      const m = document.createElement('span'); m.className = 'marker start'; m.textContent = 'S'; btn.appendChild(m);
    } else if(cell.isEnd){
      const m = document.createElement('span'); m.className = 'marker end'; m.textContent = 'E'; btn.appendChild(m);
    }

    const svg = createPipeSVG(cell);
    svg.style.transform = `rotate(${cell.rot * 90}deg)`;
    btn.appendChild(svg);

    if(!cell.isStart && !cell.isEnd){
      btn.addEventListener('click', ()=>{
        if(solved) return;
        cell.rot = (cell.rot + 1) % 4;
        svg.style.transform = `rotate(${cell.rot * 90}deg)`;
        checkSolved();
      });
    }

    boardEl.appendChild(btn);
  }

  if(autoSolveCheck.checked) showSolutionHint();
  else clearSolutionHint();
}

// ---------- 建 SVG（根據 baseConns 畫管線片段） ----------
function createPipeSVG(cell){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('aria-hidden','true');

  const g = document.createElementNS(ns, 'g');

  // 中心圓
  const center = document.createElementNS(ns,'circle');
  center.setAttribute('cx','50'); center.setAttribute('cy','50'); center.setAttribute('r','12');
  center.setAttribute('fill','#cfe7ff');
  center.setAttribute('stroke','#2b8cff');
  center.setAttribute('stroke-width','4');
  g.appendChild(center);

  // 線段範本
  const lineSpec = {
    0: {x1:50,y1:10,x2:50,y2:50},
    1: {x1:50,y1:50,x2:90,y2:50},
    2: {x1:50,y1:50,x2:50,y2:90},
    3: {x1:10,y1:50,x2:50,y2:50},
  };

  // 畫出 baseConns 的每個線段（在未旋轉狀態下）
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

  // 起/終點著色中心
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

// ---------- 計算 cell 在當前 rot 下的實際連口 ----------
function effectiveConns(cell){
  const s = new Set();
  for(const d of cell.baseConns){
    s.add((d + cell.rot) % 4);
  }
  return s;
}

function cellKey(cell){ return `${cell.r},${cell.c}`; }

// ---------- BFS 從 start 探索可達格並建立 parent map ----------
function bfsFromStart(){
  const q = [startCell];
  const vis = new Set([cellKey(startCell)]);
  const parent = {};
  while(q.length){
    const cur = q.shift();
    const curConns = effectiveConns(cur);
    for(const d of curConns){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      if(!nb) continue;
      const opp = (d+2)%4;
      const nbConns = effectiveConns(nb);
      if(!nbConns.has(opp)) continue;
      const k = cellKey(nb);
      if(!vis.has(k)){
        vis.add(k);
        parent[k] = cellKey(cur);
        q.push(nb);
      }
    }
  }
  bfsParentMap = parent;
  return vis;
}

// ---------- 檢查是否過關 ----------
function checkSolved(){
  const reachable = bfsFromStart();
  if(reachable.has(cellKey(endCell))){
    solved = true;
    msgEl.textContent = '恭喜過關！起點已連通到終點～';
    boardEl.classList.add('win');
    highlightSolutionPath();
  } else {
    msgEl.textContent = '還沒通，繼續轉轉看吧。';
    boardEl.classList.remove('win');
    if(autoSolveCheck.checked) showSolutionHint();
    else clearSolutionHint();
  }
}

// ---------- 顯示解法提示（儘量提示基礎路徑或可達路徑） ----------
function showSolutionHint(){
  clearSolutionHint();
  const reachable = bfsFromStart();
  // 若終點已在可達集合，顯示實際路徑
  if(reachable.has(cellKey(endCell))){
    let cur = cellKey(endCell);
    while(cur && cur !== cellKey(startCell)){
      const [r,c] = cur.split(',').map(Number);
      const idx = grid.findIndex(g=>g.r===r && g.c===c);
      if(idx>=0) boardEl.children[idx].classList.add('path-hint');
      cur = bfsParentMap[cur];
    }
    const sidx = grid.findIndex(g=>g===startCell);
    if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
    return;
  }
  // 否則顯示 base path（保證存在）
  // 找基礎（未旋轉）上的路徑 from start to end
  const baseParent = {};
  const q = [startCell];
  const baseVis = new Set([cellKey(startCell)]);
  while(q.length){
    const cur = q.shift();
    for(const d of cur.baseConns){
      const nr = cur.r + DIRS[d].r;
      const nc = cur.c + DIRS[d].c;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const nb = grid.find(g=>g.r===nr && g.c===nc);
      if(!nb) continue;
      const opp = (d+2)%4;
      if(!nb.baseConns.has(opp)) continue;
      const k = cellKey(nb);
      if(!baseVis.has(k)){
        baseVis.add(k);
        baseParent[k] = cellKey(cur);
        q.push(nb);
      }
    }
  }
  if(baseVis.has(cellKey(endCell))){
    let cur = cellKey(endCell);
    while(cur && cur !== cellKey(startCell)){
      const [r,c] = cur.split(',').map(Number);
      const idx = grid.findIndex(g=>g.r===r && g.c===c);
      if(idx>=0) boardEl.children[idx].classList.add('path-hint');
      cur = baseParent[cur];
    }
    const sidx = grid.findIndex(g=>g===startCell);
    if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
  }
}

function clearSolutionHint(){
  Array.from(boardEl.children).forEach(ch => ch.classList.remove('path-hint'));
}

// ---------- 過關時標示路徑 ----------
function highlightSolutionPath(){
  clearSolutionHint();
  let cur = cellKey(endCell);
  while(cur && cur !== cellKey(startCell)){
    const [r,c] = cur.split(',').map(Number);
    const idx = grid.findIndex(g=>g.r===r && g.c===c);
    if(idx>=0) boardEl.children[idx].classList.add('path-hint');
    cur = bfsParentMap[cur];
  }
  const sidx = grid.findIndex(g=>g===startCell);
  if(sidx>=0) boardEl.children[sidx].classList.add('path-hint');
}

// ---------- 綁定 UI ----------
newBtn.addEventListener('click', ()=> newLevel());
autoSolveCheck.addEventListener('change', ()=>{
  if(autoSolveCheck.checked) showSolutionHint();
  else clearSolutionHint();
});

// ---------- 開始一關 ----------
newLevel();
checkSolved();