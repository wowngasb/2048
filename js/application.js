// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});


function removeParentheses(expr) {
    const preserved = [];
    const regex = /([+\-*/]?)\s*\(([^()]+)\)\s*([+\-*/]?)/;
    let hasInner = false;
    
    do {
      hasInner = false;
      expr = expr.replace(regex, (match, prev, inner, last) => {
        hasInner = true;
        let proc = removeParentheses(inner, prev, last);
        return prev + proc(inner) + last;
      });
    } while (hasInner);

    function removeParentheses(inner, prev, last) {
      if (prev === '+' || prev === '-' || prev === '') {
        if (last === '+' || last === '-' || last === '' || ((last === '*' || last === '/') && !(/\+|-/.test(inner)))) {
          return s => prev != '-' ? s : s.replace(/(\+|-)/g, m => m === '+' ? '-' : '+');
        }
      }
      if ((prev === '*' || prev === '/') && !(/\+|-/.test(inner))) {
        return s => prev != '/' ? s : s.replace(/(\*|\/)/g, m => m === '*' ? '/' : '*');
      }
      return s => (preserved.push('(' + s + ')'), `#${preserved.length - 1}#`);
    }
  
    preserved.map((pres, i)=> {
      expr = expr.replace(`#${i}#`, pres);
    });
    return expr;
}

removeParentheses("(a+b)*(c+d)");

let _t = s => 0 && console.log(s, '=>', removeParentheses(s)); 
// 测试用例
_t("(c)"); // "c"
_t("(b+c)"); // "b-c"

_t("a+(b+c)"); // "a+b+c"
_t("a-(b+c)"); // "a-b-c"
_t("a*(b+c)"); // "a*(b+c)"
_t("a/(b*c)"); // "a/b/c"
_t("(a+b)*(c+d)")

_t("a+(b+c+d*(e-f))"); // "a+b+c+d*(e-f)"
_t("a-(b+c+d*(e-f))"); // "a-b-c-d*(e-f)"
_t("a*(b*d*(e-f))"); // "a*b*d*(e-f)"
_t("a/(b/d*(e*(c-f)))"); // "a/b*d/e(c-f)"


_t("a-(b+c)*d"); // "a-(b+c)*d"
_t("a-(b+c)-d"); // "a-b-c+d"
_t("a-(b/c)*d"); // "a-b/c*d"
_t("a/(b/c)*d"); // "a/b*c*d"

_t("a/(b*(c))+d"); // "a/b/c+d"
_t("a-(b+c)*(d)"); // "a-(b+c)*d"
_t("a-(b+(c))*d"); // "a-(b+c)*d"

function parseExpression(expr) {
    let tokens = expr.match(/([_\w\d]+|[\+\-\*\/\(\)])/g); // 分词

    function parseTerm() {
        let left = parseFactor();
        while (tokens.length && (tokens[0] === '*' || tokens[0] === '/')) {
            const op = tokens[0];
            tokens = tokens.slice(1);
            const right = parseFactor();
            left = { type: 'Op', operator: op, left, right };
        }
        return left;
    }

    function parseFactor() {
        let token = tokens[0] ?? '[EOF]';
        if (token === '(') {
            tokens = tokens.slice(1);
            let expr = parseExpr();
            expr.hasParen = expr.type === 'Op' ? 1 : 0;
            token = tokens[0] ?? '[EOF]';
            if (token !== ')') {
                _dbg();
                throw new Error(`Unexpected paren: ${token}`);
            }
            tokens = tokens.slice(1); // 跳过右括号
            return expr;
        } else if (/[_\w\d]+/.test(token)) {
            tokens = tokens.slice(1);
            return { type: 'Val', value: token };
        } else {
            _dbg();
            throw new Error(`Unexpected token: ${token}`);
        }
    }
    
    const _dbg = (ast) => ast ? console.log(ast, 'tokens:', tokens) : console.log('tokens:', tokens);
    // _dbg();
    
    function parseExpr() {
        let left = parseTerm();
        while (tokens.length && (tokens[0] === '+' || tokens[0] === '-')) {
            const op = tokens[0];
            tokens = tokens.slice(1);
            const right = parseTerm();
            left = { type: 'Op', operator: op, left, right };
        }
        return left;
    }

    let ast = parseExpr();
    tokens.length && _dbg(ast);
    return ast;
}

// 调整 AST 顺序
function reorderAST(node, parent) {
    const nmap = {'*': 1.04, '/': 1.03, '+': 1.02};
    const countOp = node => node.type === 'Op' ? ((nmap[node.operator] ?? 1) + countOp(node.left) + countOp(node.right)) : 0;
    const paren = (op, node) => node.type === 'Op' && (node.hasParen || (op === '+' && (node.operator === '*' || node.operator === '/')));
   
    function sweepNode(node) {
        const temp = node.left;
        node.left = node.right;
        node.right = temp;
    }
  
    if (node.type === 'Op') {
        node.parent = parent;
        
        if (node.operator === '+' || node.operator === '*') {
            const leftHasParen =  paren(node.operator, node.left);
            const rightHasParen = paren(node.operator, node.right);

            if (!leftHasParen && rightHasParen) {
                sweepNode(node);
            } else if (leftHasParen && rightHasParen && countOp(node.right) > countOp(node.left)) {
                sweepNode(node);
            }
        }
        
        let cur = node;
        while (cur && ((cur.left.operator === '-' && cur.operator === '+') || (cur.left.operator === '/' && cur.operator === '*'))) {
            const temp = cur.left.right;
            cur.left.right = cur.right;
            cur.right = temp;
            cur.left.operator = cur.left.operator === '-' ? '+' : '*';
            cur.operator = cur.operator === '+' ? '-' : '/';
            cur = cur.parent;
        }
        node.left = reorderAST(node.left, node);
        node.right = reorderAST(node.right, node);
    }
    return node;
}

// 将 AST 转换为字符串
function generateExpression(node, v=null) {
    if (node.type === 'Val') {
        return v ? v : node.value;
    } else if (node.type === 'Op') {
        const left = generateExpression(node.left, v);
        const right = generateExpression(node.right, v);
        return `(${left}${node.operator}${right})`;
    }
    return '';
}

// 主函数
function reorderExpression(expr) {
    if (Array.isArray(expr)) {
        return Object.assign({}, ...expr.map(v => reorderExpression(v)));
    }
    expr = removeParentheses(expr);
    const ast = parseExpression(expr);
    const reorderedAST = reorderAST(ast, null);
    let ret = generateExpression(reorderedAST);
    let rex = generateExpression(reorderedAST, 'x');
    return {[removeParentheses(rex)]: removeParentheses(ret)};
}

let _r = s => 0 && console.log(s, '=>', reorderExpression(s));

_r('a/b*(c+d)')

_r('a-d+b+c');
_r('a*b/c*d');
_r('a+c*(b-e+d)');
_r('(a+b)*(c-d+f)');



function solve24(numbers) {
  const ops = ['+', '-', '*', '/'];
  let results = {};

  function dfs(nums, path) {
    if (nums.length === 1) {
      if (Math.abs(nums[0] - 24) < 1e-6) {
        results = Object.assign(results, reorderExpression(path[0]));
      }
      return;
    }

    for (let i = 0; i < nums.length; i++) {
      for (let j = 0; j < nums.length; j++) {
        if (i === j) continue;

        const a = nums[i];
        const b = nums[j];
        const remaining = nums.filter((_, index) => index !== i && index !== j);

        for (var op = 0; op < 4; op++) {
          if (op === 3 && b === 0) continue;
          dfs([op===0 ? a+b : (op===1 ? a-b : (op===2 ? a*b : a/b)), ...remaining], [`(${path[i]}${ops[op]}${path[j]})`, ...path.filter((_, index) => index !== i && index !== j)]);
        }
      }
    }
  }

  dfs(numbers, numbers.map(String));
  return Object.values(results);
}

for (var i = 0; i < 13*13*13*13; i++) {
  if (i > 30) break;
  var numbers = [3, 3, 8, 8];
  numbers = ('_0000'+i.toString(13)).substr(-4).split('').map(s => parseInt(s, 13) + 1);
  const solutions = solve24(numbers);
  if (solutions.length > 0) {
    console.log(numbers, "找到解法：", solutions, solve24Ex(numbers));
  } else {
    // console.log(numbers, "无解");
  }
}

function solve24Ex(numbers) {
  if (!this.funcs) {
    var funcs = {};
    var expr4 = {};
    var opm = ['+', '-', '*', '/'];
    for (var i = 0; i < 4*4*4; i++) {
      var ops = ('_0000'+i.toString(4)).substr(-3).split('').map(s => opm[parseInt(s, 4)]);
  
      expr4 = Object.assign(expr4, reorderExpression([
        `a${ops[0]}((b${ops[1]}c)${ops[2]}d)`,
        `a${ops[0]}(b${ops[1]}(c${ops[2]}d))`,
        `((a${ops[0]}b)${ops[1]}c)${ops[2]}d`,
        `(a${ops[0]}(b${ops[1]}c))${ops[2]}d`,
        `(a${ops[0]}b)${ops[1]}(c${ops[2]}d)`,
      ]));
    }
    Object.values(expr4).map(k => {
      if(!canGet24(k)) { return; }
      funcs[k] = new Function('a', 'b', 'c', 'd', `return ${k} `);
    });
    this.funcs = funcs;
  }
  
  var nmap = {};
  function backtrack(path, used) {
    if (path.length === 4) {
      nmap[path.join('_')] = path;
      return;
    }
    for (var i = 0; i < numbers.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      backtrack([...path, numbers[i]], used);
      used[i] = false;
    }
  }
  backtrack([], new Array(numbers.length).fill(false));
  
  var res = {};
  var funcs = this.funcs;
  var nums4 = Object.values(nmap);
  Object.keys(funcs).map(k => {
    var func = funcs[k];
    for (var i = 0; i < nums4.length; i++) {
      var nums = nums4[i];
      var ret = func(nums[0], nums[1], nums[2], nums[3]);
      if (Math.abs(ret - 24) < 1e-6) {
        var kk = k.replace('a', nums[0]).replace('b', nums[1]).replace('c', nums[2]).replace('d', nums[3]);
        res[k] = kk;
        break;
      }
    }
  });
  return Object.values(res);
}


function canGet24(expr) {
    if (!this.nums4) {
      var nums4 = [];
      for (var a = 1; a <= 13; a++) {
        for (var b = 1; b <= 13; b++) {
          for (var c = 1; c <= 13; c++) {
            for (var d = 1; d <= 13; d++) {
              nums4.push([a, b, c, d]);
            }
          }
        }
      }
      this.nums4 = nums4;
    }
  
    var nums4 = this.nums4;
    var func = new Function('a', 'b', 'c', 'd', `return ${expr};`);
    for (var i=0;i<nums4.length;i++) {
        var nums = nums4[i];
        try {
            var ret = func(nums[0], nums[1], nums[2], nums[3]);
            if (Math.abs(ret - 24) < 1e-6) {
                return true;
            }
        } catch (err) {
            continue;
        }
    }
    return false;
}

