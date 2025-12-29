// --- BACKGROUND COLOR CHANGE HANDLER ---
if (window.api) {
  window.api.on('change-background-color', (colorHex) => {
    document.body.style.backgroundColor = `#${colorHex}`;
    localStorage.setItem('background-color', colorHex);
    const customBgModal = document.getElementById('customBgModal');
    if (customBgModal && customBgModal.classList.contains('show')) {
      customBgModal.classList.remove('show');
    }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  const savedColor = localStorage.getItem('background-color');
  if (savedColor) {
    document.body.style.backgroundColor = `#${savedColor}`;
  }
});

// --- MODAL LOGIC ---
const modalBg = document.getElementById('modalBg');
const modalTitle = document.getElementById('modalTitle');
const modalInput = document.getElementById('modalInput');
const modalOkBtn = document.getElementById('modalOkBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
let modalResolve = null;

const measureSpan = document.createElement('span');
measureSpan.style.visibility = 'hidden';
measureSpan.style.position = 'absolute';
measureSpan.style.whiteSpace = 'pre';
measureSpan.style.font = 'inherit';
measureSpan.style.fontSize = '0.75rem';
document.body.appendChild(measureSpan);

// Add: helper to focus an input and place caret at the end immediately (with RAF fallback)
function focusAndPlaceCaretEnd(input) {
  if (!input) return;
  try {
    input.focus();
    const value = input.value || '';
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(value.length, value.length);
      input.scrollLeft = input.scrollWidth || 0;
    } else {
      // fallback for inputs that don't support setSelectionRange
      input.value = '';
      input.value = value;
    }
    // Some environments may not apply focus/selection immediately; ensure on next frame too
    requestAnimationFrame(() => {
      try {
        input.focus();
        if (typeof input.setSelectionRange === 'function') {
          input.setSelectionRange(value.length, value.length);
          input.scrollLeft = input.scrollWidth || 0;
        }
      } catch (e) { /* ignore */ }
    });
  } catch (e) { /* ignore */ }
}

const SIDEBAR_MAX_WIDTH = 455;
const BUTTONS_AND_PADDING = 80;
const INDENT_PER_LEVEL = 15;
const MIN_TITLE_MAX_WIDTH = 110;
const TITLE_INPUT_SHRINK = 30; // leave some padding so text isn't flush against the buttons
const ROOT_ORDER_KEY = '__root__';
const TRASH_ID = 'trash-notebook';

let childOrderMap = {};

function getSidebarTitleWidth(depth = 0) {
  const raw = SIDEBAR_MAX_WIDTH - BUTTONS_AND_PADDING - (INDENT_PER_LEVEL * depth);
  return Math.max(MIN_TITLE_MAX_WIDTH, raw - TITLE_INPUT_SHRINK);
}

function applyTitleMaxWidth(titleElement, depth) {
  if (!titleElement) return;
  const max = getSidebarTitleWidth(depth);
  titleElement.style.maxWidth = `${max}px`;
}

function getInputPx(val) {
  measureSpan.style.fontFamily = getComputedStyle(modalInput).fontFamily;
  measureSpan.style.fontSize = getComputedStyle(modalInput).fontSize;
  measureSpan.textContent = val;
  return measureSpan.offsetWidth;
}

function getDepth(parentId) {
  let depth = 0;
  let cur = parentId;
  while (cur && notesData[cur] && notesData[cur].parent) {
    depth++;
    cur = notesData[cur].parent;
  }
  return depth;
}

// Clear all drop classes from all note elements to ensure only one is highlighted at a time
function clearAllDropClasses() {
  const allNotes = document.querySelectorAll('.has-notes');
  allNotes.forEach(li => {
    li.classList.remove('drop-above', 'drop-inside', 'drop-below');
  });
}

// Update depth and spacing for a note element and all its descendants
function updateNoteSpacing(noteElement) {
  if (!noteElement) return;
  const noteId = noteElement.getAttribute('data-note-id');
  if (!noteId) return;
  
  const title = noteElement.querySelector('.title');
  if (title) {
    const depth = getDepth(noteId);
    title.style.marginLeft = (depth * 10) + 'px';
    applyTitleMaxWidth(title, depth);
  }
  
  // Recursively update all children
  const notesList = noteElement.querySelector('.notes');
  if (notesList) {
    Array.from(notesList.children).forEach(childLi => {
      updateNoteSpacing(childLi);
    });
  }
}

function normalizeParentKey(parentId) {
  return parentId || ROOT_ORDER_KEY;
}

function hydrateChildOrderFromData(orderData) {
  childOrderMap = {};
  if (orderData && typeof orderData === 'object') {
    Object.entries(orderData).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        childOrderMap[key] = value.slice();
      }
    });
  }
  if (!childOrderMap[ROOT_ORDER_KEY]) {
    childOrderMap[ROOT_ORDER_KEY] = [];
  }
}

function rebuildOrderFromNotesData() {
  childOrderMap = {};
  Object.keys(notesData || {}).forEach((id) => {
    const node = notesData[id];
    if (!node || node.inTrash || id === TRASH_ID) return;
    const key = normalizeParentKey(node.parent);
    if (!childOrderMap[key]) childOrderMap[key] = [];
    childOrderMap[key].push(id);
  });
  if (!childOrderMap[ROOT_ORDER_KEY]) {
    childOrderMap[ROOT_ORDER_KEY] = [];
  }
}

function snapshotChildOrderFromDom() {
  const list = (typeof noteList !== 'undefined' && noteList) || document.getElementById('noteList');
  if (!list) return;
  childOrderMap = {};
  const traverse = (ul, parentId) => {
    const key = normalizeParentKey(parentId);
    childOrderMap[key] = [];
    Array.from(ul.children).forEach((li) => {
      const id = li.getAttribute && li.getAttribute('data-note-id');
      if (!id || id === TRASH_ID) return;
      childOrderMap[key].push(id);
      const nestedList = li.querySelector('.notes');
      if (nestedList) {
        traverse(nestedList, id);
      }
    });
    if (!childOrderMap[key]) {
      childOrderMap[key] = [];
    }
  };
  traverse(list, null);
  if (!childOrderMap[ROOT_ORDER_KEY]) {
    childOrderMap[ROOT_ORDER_KEY] = [];
  }
}

function getOrderedChildren(parentId) {
  const key = normalizeParentKey(parentId);
  const orderList = childOrderMap[key] || [];
  const filtered = orderList.filter((id) => {
    const node = notesData[id];
    if (!node || node.inTrash) return false;
    if (parentId === null) {
      return node.parent === null || node.parent === undefined;
    }
    return node.parent === parentId;
  });
  if (filtered.length) return filtered;
  return Object.keys(notesData)
    .filter((id) => {
      const node = notesData[id];
      if (!node || node.inTrash || id === TRASH_ID) return false;
      if (parentId === null) {
        return node.parent === null || node.parent === undefined;
      }
      return node.parent === parentId;
    });
}

hydrateChildOrderFromData(null);

function prioritizeImportedRootNotesAtTop(importedIds, importedOrder = null) {
  if (!Array.isArray(importedIds) || importedIds.length === 0) return;
  const key = ROOT_ORDER_KEY;
  if (!childOrderMap[key]) childOrderMap[key] = [];
  const seen = new Set();
  
  // If importedOrder exists, use that order for root notes; otherwise use the order from importedIds
  let orderedImported = [];
  if (importedOrder && importedOrder[key] && Array.isArray(importedOrder[key])) {
    // Use the order from importedOrder, filtering to only include importedIds
    const importedSet = new Set(importedIds);
    orderedImported = importedOrder[key]
      .map(oldId => idRemap ? idRemap.get(oldId) : oldId)
      .filter(id => id && importedSet.has(id));
    // Add any importedIds not in the order
    importedIds.forEach((id) => {
      if (!orderedImported.includes(id)) {
        orderedImported.push(id);
      }
    });
  } else {
    // No order data, use the order from importedIds
    importedIds.forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        orderedImported.push(id);
      }
    });
  }
  
  const remaining = childOrderMap[key].filter(id => !orderedImported.includes(id));
  childOrderMap[key] = [...orderedImported, ...remaining];
}

function closeAllModals() {
  if (modalResolve) {
    closeModal(null);
  } else {
    modalBg.classList.remove('show');
  }

  if (deleteModalResolve) {
    closeDeleteModal(false);
  } else {
    deleteModalBg.classList.remove('show');
  }

  mathSymbolsModalBg.classList.remove('show');
  customBgModal.classList.remove('show');

  // If the custom table modal is open, hide and reset it
  if (typeof resetCustomTableModalState === 'function') {
    resetCustomTableModalState();
  }
  customTableModalBg.classList.remove('show');

  selectedSymbolRow = null;
  selectedSymbolCode = null;
  if (mathSymbolsModalInsertBtn) {
    mathSymbolsModalInsertBtn.disabled = true;
    mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
  }
}

function showModal({ title, initialValue = '', depth = 0 }) {
  closeAllModals();

  const maxPx = getSidebarTitleWidth(depth);
  modalTitle.textContent = title;
  modalInput.value = initialValue;
  modalInput.style.maxWidth = `${maxPx}px`;
  modalBg.classList.add('show');
  // Focus immediately (no 100ms timeout)
  focusAndPlaceCaretEnd(modalInput);

  if (modalInput._handler) modalInput.removeEventListener('input', modalInput._handler);

  const handler = () => {
    let val = modalInput.value;
    while (getInputPx(val) > maxPx && val.length > 0) {
      val = val.slice(0, -1);
    }
    if (modalInput.value !== val) {
      modalInput.value = val;
    }
    const disabled = !modalInput.value.trim();
    modalOkBtn.disabled = disabled;
    modalOkBtn.style.cursor = disabled ? 'not-allowed' : '';
  };
  modalInput.addEventListener('input', handler);
  modalInput._handler = handler;

  const disabled = !modalInput.value.trim();
  modalOkBtn.disabled = disabled;
  modalOkBtn.style.cursor = disabled ? 'not-allowed' : '';

  return new Promise((resolve) => { modalResolve = resolve; });
}
function closeModal(result) {
  modalBg.classList.remove('show');
  modalResolve && modalResolve(result);
  modalResolve = null;
}
modalOkBtn.onclick = () => {
  if (modalOkBtn.disabled) return;
  closeModal(modalInput.value.trim());
};
modalCancelBtn.onclick = () => { closeModal(null); };
modalBg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === modalCancelBtn) {
      modalCancelBtn.click();
    } else if (!modalOkBtn.disabled) {
      modalOkBtn.click();
    }
  } else if (e.key === 'Escape') {
    modalCancelBtn.click();
  }
});

// --- DELETE MODAL LOGIC ---
const deleteModalBg = document.getElementById('deleteModalBg');
const deleteModalYesBtn = document.getElementById('deleteModalYesBtn');
const deleteModalNoBtn = document.getElementById('deleteModalNoBtn');
const deleteModalTitle = document.getElementById('deleteModalTitle');
let deleteModalResolve = null;
function showDeleteModal(name) {
  closeAllModals();
  deleteModalTitle.textContent = `Are you sure you want to delete "${name}"?`;
  deleteModalBg.classList.add('show');
  return new Promise((resolve) => { deleteModalResolve = resolve; });
}
function closeDeleteModal(result) {
  deleteModalBg.classList.remove('show');
  deleteModalResolve && deleteModalResolve(result);
  deleteModalResolve = null;
}
deleteModalYesBtn.onclick = () => closeDeleteModal(true);
deleteModalNoBtn.onclick = () => closeDeleteModal(false);
deleteModalBg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === deleteModalNoBtn) {
      deleteModalNoBtn.click();
    } else {
      deleteModalYesBtn.click();
    }
  } else if (e.key === 'Escape') {
    deleteModalNoBtn.click();
  }
});

// --- MATH SYMBOLS MODAL LOGIC ---
const mathSymbolsModalBg = document.getElementById('mathSymbolsModalBg');
const mathSymbolsModalCancelBtn = document.getElementById('mathSymbolsModalCancelBtn');
const mathSymbolsTable = document.getElementById('mathSymbolsTable').querySelector('tbody');
const mathSymbolsDialog = document.querySelector('.math-symbols-modal-dialog');
const mathSymbolsModalInsertBtn = document.getElementById('mathSymbolsModalInsertBtn');
const mathSymbolsSearch = document.getElementById('mathSymbolsSearch');
let selectedSymbolRow = null;
let selectedSymbolCode = null;

const mathSymbolsList = [
  { symbol: '\\( \\alpha \\)', code: '\\alpha', keywords: 'greek lowercase alpha' },
  { symbol: '\\( \\beta \\)', code: '\\beta', keywords: 'greek lowercase beta' },
  { symbol: '\\( \\gamma \\)', code: '\\gamma', keywords: 'greek lowercase gamma' },
  { symbol: '\\( \\delta \\)', code: '\\delta', keywords: 'greek lowercase delta' },
  { symbol: '\\( \\epsilon \\)', code: '\\epsilon', keywords: 'greek lowercase epsilon' },
  { symbol: '\\( \\zeta \\)', code: '\\zeta', keywords: 'greek lowercase zeta' },
  { symbol: '\\( \\eta \\)', code: '\\eta', keywords: 'greek lowercase eta' },
  { symbol: '\\( \\theta \\)', code: '\\theta', keywords: 'greek lowercase theta' },
  { symbol: '\\( \\iota \\)', code: '\\iota', keywords: 'greek lowercase iota' },
  { symbol: '\\( \\kappa \\)', code: '\\kappa', keywords: 'greek lowercase kappa' },
  { symbol: '\\( \\lambda \\)', code: '\\lambda', keywords: 'greek lowercase lambda' },
  { symbol: '\\( \\mu \\)', code: '\\mu', keywords: 'greek lowercase mu' },
  { symbol: '\\( \\nu \\)', code: '\\nu', keywords: 'greek lowercase nu' },
  { symbol: '\\( \\xi \\)', code: '\\xi', keywords: 'greek lowercase xi' },
  { symbol: '\\( \\omicron \\)', code: '\\omicron', keywords: 'greek lowercase omicron' },
  { symbol: '\\( \\pi \\)', code: '\\pi', keywords: 'greek lowercase pi' },
  { symbol: '\\( \\rho \\)', code: '\\rho', keywords: 'greek lowercase rho' },
  { symbol: '\\( \\sigma \\)', code: '\\sigma', keywords: 'greek lowercase sigma' },
  { symbol: '\\( \\tau \\)', code: '\\tau', keywords: 'greek lowercase tau' },
  { symbol: '\\( \\upsilon \\)', code: '\\upsilon', keywords: 'greek lowercase upsilon' },
  { symbol: '\\( \\phi \\)', code: '\\phi', keywords: 'greek lowercase phi' },
  { symbol: '\\( \\chi \\)', code: '\\chi', keywords: 'greek lowercase chi' },
  { symbol: '\\( \\psi \\)', code: '\\psi', keywords: 'greek lowercase psi' },
  { symbol: '\\( \\omega \\)', code: '\\omega', keywords: 'greek lowercase omega' },
  { symbol: '\\( \\Gamma \\)', code: '\\Gamma', keywords: 'greek uppercase gamma' },
  { symbol: '\\( \\Delta \\)', code: '\\Delta', keywords: 'greek uppercase delta' },
  { symbol: '\\( \\Theta \\)', code: '\\Theta', keywords: 'greek uppercase theta' },
  { symbol: '\\( \\Lambda \\)', code: '\\Lambda', keywords: 'greek uppercase lambda' },
  { symbol: '\\( \\Xi \\)', code: '\\Xi', keywords: 'greek uppercase xi' },
  { symbol: '\\( \\Pi \\)', code: '\\Pi', keywords: 'greek uppercase pi' },
  { symbol: '\\( \\Sigma \\)', code: '\\Sigma', keywords: 'greek uppercase sigma' },
  { symbol: '\\( \\Upsilon \\)', code: '\\Upsilon', keywords: 'greek uppercase upsilon' },
  { symbol: '\\( \\Phi \\)', code: '\\Phi', keywords: 'greek uppercase phi' },
  { symbol: '\\( \\Psi \\)', code: '\\Psi', keywords: 'greek uppercase psi' },
  { symbol: '\\( \\Omega \\)', code: '\\Omega', keywords: 'greek uppercase omega' },
  { symbol: '\\( + \\)', code: '+', keywords: 'plus add addition' },
  { symbol: '\\( - \\)', code: '-', keywords: 'minus subtract subtraction' },
  { symbol: '\\( \\pm \\)', code: '\\pm', keywords: 'plus-minus plus minus add subtract' },
  { symbol: '\\( \\mp \\)', code: '\\mp', keywords: 'minus-plus minus plus subtract add' },
  { symbol: '\\( \\times \\)', code: '\\times', keywords: 'multiply multiplication cross product' },
  { symbol: '\\( \\div \\)', code: '\\div', keywords: 'divide division obelus' },
  { symbol: '\\( \\cdot \\)', code: '\\cdot', keywords: 'dot multiplication product' },
  { symbol: '\\( \\ast \\)', code: '\\ast', keywords: 'asterisk star multiplication' },
  { symbol: '\\( \\star \\)', code: '\\star', keywords: 'star multiplication' },
  { symbol: '\\( \\circ \\)', code: '\\circ', keywords: 'circle ring composition' },
  { symbol: '\\( \\bullet \\)', code: '\\bullet', keywords: 'bullet dot product list' },
  { symbol: '\\( \\oplus \\)', code: '\\oplus', keywords: 'circle direct sum xor plus' },
  { symbol: '\\( \\ominus \\)', code: '\\ominus', keywords: 'circle direct difference minus' },
  { symbol: '\\( \\otimes \\)', code: '\\otimes', keywords: 'circle tensor product outer multiplication' },
  { symbol: '\\( \\oslash \\)', code: '\\oslash', keywords: 'divide circle circled division quotient set' },
  { symbol: '\\( \\odot \\)', code: '\\odot', keywords: 'circle circled hadamard product dot' },
  { symbol: '\\( \\bigcirc \\)', code: '\\bigcirc', keywords: 'big circle operator' },
  { symbol: '\\( \\triangleleft \\)', code: '\\triangleleft', keywords: 'triangle left normal subgroup' },
  { symbol: '\\( \\triangleright \\)', code: '\\triangleright', keywords: 'triangle right contains' },
  { symbol: '\\( \\bigtriangleup \\)', code: '\\bigtriangleup', keywords: 'solid pyramid triangle up' },
  { symbol: '\\( \\bigtriangledown \\)', code: '\\bigtriangledown', keywords: 'solid inverted delta triangle down' },
  { symbol: '\\( \\wedge \\)', code: '\\wedge', keywords: 'logical and wedge meet' },
  { symbol: '\\( \\vee \\)', code: '\\vee', keywords: 'logical or vee join' },
  { symbol: '\\( \\cap \\)', code: '\\cap', keywords: 'set intersection cap meet' },
  { symbol: '\\( \\cup \\)', code: '\\cup', keywords: 'set union cup join' },
  { symbol: '\\( \\setminus \\)', code: '\\setminus', keywords: 'set difference backslash' },
  { symbol: '\\( \\wr \\)', code: '\\wr', keywords: 'wreath product' },
  { symbol: '\\( \\diamond \\)', code: '\\diamond', keywords: 'diamond lozenge' },
  { symbol: '\\( \\lhd \\)', code: '\\lhd', keywords: 'triangle left normal subgroup' },
  { symbol: '\\( \\rhd \\)', code: '\\rhd', keywords: 'triangle right contains' },
  { symbol: '\\( \\unlhd \\)', code: '\\unlhd', keywords: 'triangle left equal normal subgroup' },
  { symbol: '\\( \\unrhd \\)', code: '\\unrhd', keywords: 'triangle right equal contains' },
  { symbol: '\\( = \\)', code: '=', keywords: 'equal to equals' },
  { symbol: '\\( \\neq \\)', code: '\\neq', keywords: 'not equal to not equals' },
  { symbol: '\\( < \\)', code: '<', keywords: 'less smaller than' },
  { symbol: '\\( > \\)', code: '>', keywords: 'greater more than' },
  { symbol: '\\( \\leq \\)', code: '\\leq', keywords: 'less smaller than or equal to' },
  { symbol: '\\( \\geq \\)', code: '\\geq', keywords: 'greater more than or equal to' },
  { symbol: '\\( \\equiv \\)', code: '\\equiv', keywords: 'equivalent congruent to' },
  { symbol: '\\( \\sim \\)', code: '\\sim', keywords: 'tilde similar' },
  { symbol: '\\( \\simeq \\)', code: '\\simeq', keywords: 'asymptotically equal similar' },
  { symbol: '\\( \\approx \\)', code: '\\approx', keywords: 'approximately equal almost equal' },
  { symbol: '\\( \\cong \\)', code: '\\cong', keywords: 'congruent equal equivalent' },
  { symbol: '\\( \\propto \\)', code: '\\propto', keywords: 'proportional to' },
  { symbol: '\\( \\in \\)', code: '\\in', keywords: 'element of in set' },
  { symbol: '\\( \\ni \\)', code: '\\ni', keywords: 'contains as member has element' },
  { symbol: '\\( \\notin \\)', code: '\\notin', keywords: 'not element of not in set' },
  { symbol: '\\( \\subset \\)', code: '\\subset', keywords: 'included in' },
  { symbol: '\\( \\supset \\)', code: '\\supset', keywords: 'superset includes' },
  { symbol: '\\( \\subseteq \\)', code: '\\subseteq', keywords: 'subset equal include' },
  { symbol: '\\( \\supseteq \\)', code: '\\supseteq', keywords: 'superset equal include' },
  { symbol: '\\( \\nsubseteq \\)', code: '\\nsubseteq', keywords: 'not subset equal' },
  { symbol: '\\( \\nsupseteq \\)', code: '\\nsupseteq', keywords: 'not superset equal' },
  { symbol: '\\( \\subsetneq \\)', code: '\\subsetneq', keywords: 'proper strict subset not equal' },
  { symbol: '\\( \\supsetneq \\)', code: '\\supsetneq', keywords: 'proper strict superset not equal' },
  { symbol: '\\( \\parallel \\)', code: '\\parallel', keywords: 'parallel' },
  { symbol: '\\( \\nparallel \\)', code: '\\nparallel', keywords: 'not parallel' },
  { symbol: '\\( \\perp \\)', code: '\\perp', keywords: 'perpendicular orthogonal' },
  { symbol: '\\( \\mid \\)', code: '\\mid', keywords: 'divides such that vertical' },
  { symbol: '\\( \\nmid \\)', code: '\\nmid', keywords: 'does not divide' },
  { symbol: '\\( \\vdash \\)', code: '\\vdash', keywords: 'entails proves' },
  { symbol: '\\( \\dashv \\)', code: '\\dashv', keywords: 'is entailed by' },
  { symbol: '\\( \\models \\)', code: '\\models', keywords: 'satisfies true in' },
  { symbol: '\\( \\leftarrow \\)', code: '\\leftarrow', keywords: 'west assignment' },
  { symbol: '\\( \\rightarrow \\)', code: '\\rightarrow', keywords: 'east implies function' },
  { symbol: '\\( \\leftrightarrow \\)', code: '\\leftrightarrow', keywords: 'double sided horizontal bidirectional' },
  { symbol: '\\( \\Leftarrow \\)', code: '\\Leftarrow', keywords: 'double thick reverse implication' },
  { symbol: '\\( \\Rightarrow \\)', code: '\\Rightarrow', keywords: 'double thick logical implication' },
  { symbol: '\\( \\Leftrightarrow \\)', code: '\\Leftrightarrow', keywords: 'double sided horizontal bidirectional thick iff if and only if logical equivalence' },
  { symbol: '\\( \\uparrow \\)', code: '\\uparrow', keywords: 'north' },
  { symbol: '\\( \\downarrow \\)', code: '\\downarrow', keywords: 'south' },
  { symbol: '\\( \\updownarrow \\)', code: '\\updownarrow', keywords: 'double sided vertical bidirectional' },
  { symbol: '\\( \\Uparrow \\)', code: '\\Uparrow', keywords: 'double thick' },
  { symbol: '\\( \\Downarrow \\)', code: '\\Downarrow', keywords: 'double thick' },
  { symbol: '\\( \\Updownarrow \\)', code: '\\Updownarrow', keywords: 'double sided vertical bidirectional thick' },
  { symbol: '\\( \\forall \\)', code: '\\forall', keywords: 'for all universal quantifier every' },
  { symbol: '\\( \\exists \\)', code: '\\exists', keywords: 'there exists existential quantifier' },
  { symbol: '\\( \\neg \\)', code: '\\neg', keywords: 'not negation' },
  { symbol: '\\( \\land \\)', code: '\\land', keywords: 'and logical conjunction' },
  { symbol: '\\( \\lor \\)', code: '\\lor', keywords: 'or logical disjunction' },
  { symbol: '\\( \\int \\)', code: '\\int', keywords: 'integral integration' },
  { symbol: '\\( \\iint \\)', code: '\\iint', keywords: 'double integral surface integration' },
  { symbol: '\\( \\iiint \\)', code: '\\iiint', keywords: 'triple integral volume integration' },
  { symbol: '\\( \\oint \\)', code: '\\oint', keywords: 'contour integral closed integration' },
  { symbol: '\\( \\sum \\)', code: '\\sum', keywords: 'summation sigma' },
  { symbol: '\\( \\prod \\)', code: '\\prod', keywords: 'product pi' },
  { symbol: '\\( \\coprod \\)', code: '\\coprod', keywords: 'coproduct dual product' },
  { symbol: '\\( \\lim \\)', code: '\\lim', keywords: 'limit approaching' },
  { symbol: '\\( \\infty \\)', code: '\\infty', keywords: 'infinity infinite' },
  { symbol: '\\( \\partial \\)', code: '\\partial', keywords: 'derivative' },
  { symbol: '\\( \\sqrt{x} \\)', code: '\\sqrt{x}', keywords: 'square root radical' },
  { symbol: '\\( \\sqrt[n]{x} \\)', code: '\\sqrt[n]{x}', keywords: 'nth root radical index' },
  { symbol: '\\( \\frac{a}{b} \\)', code: '\\frac{a}{b}', keywords: 'fraction divide division ratio' },
  { symbol: '\\( \\binom{n}{k} \\)', code: '\\binom{n}{k}', keywords: 'binomial coefficient choose combinations' },
  { symbol: '\\( \\limsup \\)', code: '\\limsup', keywords: 'limit superior upper limit real analysis' },
  { symbol: '\\( \\liminf \\)', code: '\\liminf', keywords: 'limit inferior lower limit real analysis' },
  { symbol: '\\( \\nabla \\)', code: '\\nabla', keywords: 'gradient del operator vector divergence curl' },
  { symbol: '\\( \\overline{x} \\)', code: '\\overline{x}', keywords: 'mean bar notation complex conjugate average' },
  { symbol: '\\( \\underline{x} \\)', code: '\\underline{x}', keywords: 'underline bar emphasize lower bound notation' },
  { symbol: '\\( \\dot{x} \\)', code: '\\dot{x}', keywords: 'time derivative newton notation' },
  { symbol: '\\( \\ddot{x} \\)', code: '\\ddot{x}', keywords: 'double second derivative acceleration newton notation' },
  { symbol: '\\( \\varlimsup \\)', code: '\\varlimsup', keywords: 'variant upper limit' },
  { symbol: '\\( \\varliminf \\)', code: '\\varliminf', keywords: 'variant lower limit' },
  { symbol: '\\( \\varinjlim \\)', code: '\\varinjlim', keywords: 'variant inductive direct limit colimit' },
  { symbol: '\\( \\varprojlim \\)', code: '\\varprojlim', keywords: 'variant projective inverse limit' },
  { symbol: '\\( \\smallint \\)', code: '\\smallint', keywords: 'tiny inline integral' },
  { symbol: '\\( \\therefore \\)', code: '\\therefore', keywords: 'therefore conclusion so thus logic symbol' },
  { symbol: '\\( \\because \\)', code: '\\because', keywords: 'because since reason logic symbol' },
  { symbol: '\\( \\implies \\)', code: '\\implies', keywords: 'implies implication logic if then' },
  { symbol: '\\( \\iff \\)', code: '\\iff', keywords: 'if and only if equivalence logic' },
  { symbol: '\\( \\not \\)', code: '\\not', keywords: 'not logical negation' },
  { symbol: '\\( \\bigcup \\)', code: '\\bigcup', keywords: 'union set theory big large disjoint union' },
  { symbol: '\\( \\bigcap \\)', code: '\\bigcap', keywords: 'intersection set theory big large intersection common elements' },
  { symbol: '\\( \\complement \\)', code: '\\complement', keywords: 'set difference theory negation' },
  { symbol: '\\( \\exists! \\)', code: '\\exists!', keywords: 'there unique existence quantifier logic' },
  { symbol: '\\( \\langle \\)', code: '\\langle', keywords: 'left bracket inner product dirac vector notation' },
  { symbol: '\\( \\rangle \\)', code: '\\rangle', keywords: 'right bracket inner product dirac vector notation' },
  { symbol: '\\( \\lfloor \\)', code: '\\lfloor', keywords: 'left bracket function greatest integer less than' },
  { symbol: '\\( \\rfloor \\)', code: '\\rfloor', keywords: 'right bracket function integer part' },
  { symbol: '\\( \\lceil \\)', code: '\\lceil', keywords: 'left ceiling bracket function smallest integer greater than' },
  { symbol: '\\( \\rceil \\)', code: '\\rceil', keywords: 'right ceiling bracket function integer ceiling' },
  { symbol: '\\( \\dotsb \\)', code: '\\dotsb', keywords: 'binary operators ellipsis math between terms' },
  { symbol: '\\( \\dotsi \\)', code: '\\dotsi', keywords: 'integrals ellipsis math in integrals' },
  { symbol: '\\( \\dotsc \\)', code: '\\dotsc', keywords: 'commas separated dots ellipsis list continuation' },
  { symbol: '\\( \\dotso \\)', code: '\\dotso', keywords: 'others ellipsis contexts trailing general use' },
  { symbol: '\\( \\hookrightarrow \\)', code: '\\hookrightarrow', keywords: 'injection function inclusion imbedding' },
  { symbol: '\\( \\hookleftarrow \\)', code: '\\hookleftarrow', keywords: 'injection function' },
  { symbol: '\\( \\mapsto \\)', code: '\\mapsto', keywords: 'maps to mapping function arrow notation transformation' },
  { symbol: '\\( \\longrightarrow \\)', code: '\\longrightarrow', keywords: 'function implication output logical consequence' },
  { symbol: '\\( \\longleftarrow \\)', code: '\\longleftarrow', keywords: 'reverse implication input mapping' },
  { symbol: '\\( \\longleftrightarrow \\)', code: '\\longleftrightarrow', keywords: 'double equivalence bidirectional relation' },
  { symbol: '\\( \\Longrightarrow \\)', code: '\\Longrightarrow', keywords: 'double logical implication implies deduce inference' },
  { symbol: '\\( \\Longleftarrow \\)', code: '\\Longleftarrow', keywords: 'double reverse inference logical consequence' },
  { symbol: '\\( \\Longleftrightarrow \\)', code: '\\Longleftrightarrow', keywords: 'double equivalence arrow iff if and only if logical equivalence' },
  { symbol: '\\( \\vec{v} \\)', code: '\\vec{v}', keywords: 'vector arrow notation direction magnitude' },
  { symbol: '\\( \\hat{x} \\)', code: '\\hat{x}', keywords: 'accent estimator unit vector normalization' },
  { symbol: '\\( \\tilde{x} \\)', code: '\\tilde{x}', keywords: 'accent approximation perturbation' },
  { symbol: '\\( \\bar{x} \\)', code: '\\bar{x}', keywords: 'accent mean average complex conjugate' },
  { symbol: '\\( \\dfrac{a}{b} \\)', code: '\\dfrac{a}{b}', keywords: 'display fraction division' },
  { symbol: '\\( \\tfrac{a}{b} \\)', code: '\\tfrac{a}{b}', keywords: 'text fraction inline division' },
  { symbol: '\\( \\bmod \\)', code: '\\bmod', keywords: 'modulo remainder arithmetic operation congruence' },
  { symbol: '\\( \\pmod{n} \\)', code: '\\pmod{n}', keywords: 'parentheses modulo modular arithmetic operation congruence class' },
  { symbol: '\\( \\left\\lfloor x \\right\\rfloor \\)', code: '\\left\\lfloor x \\right\\rfloor', keywords: 'function bracket notation greatest integer' },
  { symbol: '\\( \\left\\lceil x \\right\\rceil \\)', code: '\\left\\lceil x \\right\\rceil', keywords: 'ceiling function bracket notation smallest integer' },
  { symbol: '\\( \\rightarrowtail \\)', code: '\\rightarrowtail', keywords: 'feather east' },
  { symbol: '\\( \\leftarrowtail \\)', code: '\\leftarrowtail', keywords: 'feather west' },
  { symbol: '\\( \\twoheadrightarrow \\)', code: '\\twoheadrightarrow', keywords: 'two head east spear' },
  { symbol: '\\( \\twoheadleftarrow \\)', code: '\\twoheadleftarrow', keywords: 'two head west spear' },
  { symbol: '\\( \\rightsquigarrow \\)', code: '\\rightsquigarrow', keywords: 'east squiggly spear' },
  { symbol: '\\( \\leftrightsquigarrow \\)', code: '\\leftrightsquigarrow', keywords: 'double sided squiggly wavy' },
  { symbol: '\\( \\looparrowright \\)', code: '\\looparrowright', keywords: 'east cyclic' },
  { symbol: '\\( \\looparrowleft \\)', code: '\\looparrowleft', keywords: 'west cyclic' },
  { symbol: '\\( \\curvearrowleft \\)', code: '\\curvearrowleft', keywords: 'curved west' },
  { symbol: '\\( \\curvearrowright \\)', code: '\\curvearrowright', keywords: 'curved east' },
  { symbol: '\\( \\circlearrowleft \\)', code: '\\circlearrowleft', keywords: 'circular rotation west' },
  { symbol: '\\( \\circlearrowright \\)', code: '\\circlearrowright', keywords: 'circular rotation east' },
  { symbol: '\\( \\rightleftharpoons \\)', code: '\\rightleftharpoons', keywords: 'equilibrium double sided' },
  { symbol: '\\( \\leftrightharpoons \\)', code: '\\leftrightharpoons', keywords: 'equilibrium double sided' },
  { symbol: '\\( \\rightharpoonup \\)', code: '\\rightharpoonup', keywords: 'reaction arrow' },
  { symbol: '\\( \\rightharpoondown \\)', code: '\\rightharpoondown', keywords: 'chem arrow' },
  { symbol: '\\( \\leftharpoonup \\)', code: '\\leftharpoonup', keywords: 'reaction arrow' },
  { symbol: '\\( \\leftharpoondown \\)', code: '\\leftharpoondown', keywords: 'chem arrow' },
  { symbol: '\\( \\upharpoonleft \\)', code: '\\upharpoonleft', keywords: 'chem arrow' },
  { symbol: '\\( \\upharpoonright \\)', code: '\\upharpoonright', keywords: 'chem arrow' },
  { symbol: '\\( \\downharpoonleft \\)', code: '\\downharpoonleft', keywords: 'chem arrow' },
  { symbol: '\\( \\downharpoonright \\)', code: '\\downharpoonright', keywords: 'chem arrow' },
  { symbol: '\\( \\sqsubset \\)', code: '\\sqsubset', keywords: 'square partial order' },
  { symbol: '\\( \\sqsupset \\)', code: '\\sqsupset', keywords: 'square superset partial order' },
  { symbol: '\\( \\sqsubseteq \\)', code: '\\sqsubseteq', keywords: 'square subset or equal' },
  { symbol: '\\( \\sqsupseteq \\)', code: '\\sqsupseteq', keywords: 'square superset or equal' },
  { symbol: '\\( \\varsubsetneq \\)', code: '\\varsubsetneq', keywords: 'variant not equal strict subset' },
  { symbol: '\\( \\varsupsetneq \\)', code: '\\varsupsetneq', keywords: 'variant strict superset not equal' },
  { symbol: '\\( \\subsetneqq \\)', code: '\\subsetneqq', keywords: 'strict double less not equal' },
  { symbol: '\\( \\supsetneqq \\)', code: '\\supsetneqq', keywords: 'superset not equal strict double greater' },
  { symbol: '\\( \\nsubseteqq \\)', code: '\\nsubseteqq', keywords: 'not equal invalid set' },
  { symbol: '\\( \\Game \\)', code: '\\Game', keywords: 'loopy G math symbol' },
  { symbol: '\\( \\Bbbk \\)', code: '\\Bbbk', keywords: 'blackboard bold k math field constant' },
  { symbol: '\\( \\overbrace{a+b+c} \\)', code: '\\overbrace{a+b+c}', keywords: 'grouping above' },
  { symbol: '\\( \\underbrace{a+b+c} \\)', code: '\\underbrace{a+b+c}', keywords: 'grouping below' },
  { symbol: '\\( \\overleftarrow{AB} \\)', code: '\\overleftarrow{AB}', keywords: 'vector notation' },
  { symbol: '\\( \\overrightarrow{AB} \\)', code: '\\overrightarrow{AB}', keywords: 'vector notation' },
  { symbol: '\\( \\underleftarrow{AB} \\)', code: '\\underleftarrow{AB}', keywords: 'vector' },
  { symbol: '\\( \\underrightarrow{AB} \\)', code: '\\underrightarrow{AB}', keywords: 'vector' },
  { symbol: '\\( \\overleftrightarrow{AB} \\)', code: '\\overleftrightarrow{AB}', keywords: 'both sided directions vector' },
  { symbol: '\\( \\underleftrightarrow{AB} \\)', code: '\\underleftrightarrow{AB}', keywords: 'both sided directions vector' },
  { symbol: '\\( \\mathring{x} \\)', code: '\\mathring{x}', keywords: 'accent interior open set' },
  { symbol: '\\( \\lvert \\)', code: '\\lvert', keywords: 'left vertical bar absolute value magnitude' },
  { symbol: '\\( \\rvert \\)', code: '\\rvert', keywords: 'right vertical bar absolute value magnitude' },
  { symbol: '\\( \\lVert \\)', code: '\\lVert', keywords: 'left double vertical bar norm magnitude parallel' },
  { symbol: '\\( \\rVert \\)', code: '\\rVert', keywords: 'right double vertical bar norm magnitude parallel' },
  { symbol: '\\( \\left( \\right) \\)', code: '\\left( \\right)', keywords: 'parentheses brackets round delimiter' },
  { symbol: '\\( \\left[ \\right] \\)', code: '\\left[ \\right]', keywords: 'square brackets delimiter' },
  { symbol: '\\( \\left\\{ \\right\\} \\)', code: '\\left\\{ \\right\\}', keywords: 'curly braces delimiter set' },
  { symbol: '\\( \\left| \\right| \\)', code: '\\left| \\right|', keywords: 'absolute value bars magnitude delimiter' },
  { symbol: '\\( \\left\\langle \\right\\rangle \\)', code: '\\left\\langle \\right\\rangle', keywords: 'angle brackets inner product dirac vector notation delimiter' },
  { symbol: '\\( \\bigwedge \\)', code: '\\bigwedge', keywords: 'and operator logical intersection' },
  { symbol: '\\( \\bigvee \\)', code: '\\bigvee', keywords: 'or operator logical union' },
  { symbol: '\\( \\bigsqcup \\)', code: '\\bigsqcup', keywords: 'disjoint union' },
  { symbol: '\\( \\bigodot \\)', code: '\\bigodot', keywords: 'circle operator' },
  { symbol: '\\( \\bigotimes \\)', code: '\\bigotimes', keywords: 'circle tensor cross product' },
  { symbol: '\\( \\bigoplus \\)', code: '\\bigoplus', keywords: 'circle direct sum' },
  { symbol: '\\( \\biguplus \\)', code: '\\biguplus', keywords: 'multiset disjoint union plus' },
  { symbol: '\\( \\text{Text} \\)', code: '\\text{Text}', keywords: 'normal words' },
  { symbol: '\\( \\mathrm{ABC} \\)', code: '\\mathrm{ABC}', keywords: 'upright roman text' },
  { symbol: '\\( \\mathit{ABC} \\)', code: '\\mathit{ABC}', keywords: 'italic' },
  { symbol: '\\( \\mathbf{ABC} \\)', code: '\\mathbf{ABC}', keywords: 'bold' },
  { symbol: '\\( \\mathsf{ABC} \\)', code: '\\mathsf{ABC}', keywords: 'sans serif' },
  { symbol: '\\( \\mathtt{ABC} \\)', code: '\\mathtt{ABC}', keywords: 'monospace typewriter' },
  { symbol: '\\( \\mathcal{ABC} \\)', code: '\\mathcal{ABC}', keywords: 'calligraphic script' },
  { symbol: '\\( \\mathbb{ABC} \\)', code: '\\mathbb{ABC}', keywords: 'blackboard bold double struck' },
  { symbol: '\\( \\mathfrak{ABC} \\)', code: '\\mathfrak{ABC}', keywords: 'fraktur gothic' },
  { symbol: '1 em Space', code: '\\quad', keywords: 'space' },
  { symbol: '2 em Space', code: '\\qquad', keywords: 'double space' },
  { symbol: '\\( \\cdots \\)', code: '\\cdots', keywords: 'horizontal' },
  { symbol: '\\( \\ldots \\)', code: '\\ldots', keywords: 'low ellipsis' },
  { symbol: '\\( \\vdots \\)', code: '\\vdots', keywords: 'vertical' },
  { symbol: '\\( \\ddots \\)', code: '\\ddots', keywords: 'diagonal' },
  { symbol: '\\( \\cfrac{a}{b} \\)', code: '\\cfrac{a}{b}', keywords: 'continued fraction' },
  { symbol: '\\( \\genfrac{}{}{0pt}{}{a}{b} \\)', code: '\\genfrac{}{}{0pt}{}{a}{b}', keywords: 'general fraction binomial' },
  { symbol: '\\( \\overline{abc} \\)', code: '\\overline{abc}', keywords: 'bar above' },
  { symbol: '\\( \\underline{abc} \\)', code: '\\underline{abc}', keywords: 'bar below' },
  { symbol: '\\( \\varepsilon \\)', code: '\\varepsilon', keywords: 'variant' },
  { symbol: '\\( \\vartheta \\)', code: '\\vartheta', keywords: 'variant' },
  { symbol: '\\( \\varpi \\)', code: '\\varpi', keywords: 'variant' },
  { symbol: '\\( \\varrho \\)', code: '\\varrho', keywords: 'variant' },
  { symbol: '\\( \\varsigma \\)', code: '\\varsigma', keywords: 'variant' },
  { symbol: '\\( \\varphi \\)', code: '\\varphi', keywords: 'variant' },
  { symbol: '\\( \\ell \\)', code: '\\ell', keywords: 'length script cursive l' },
  { symbol: '\\( \\Im \\)', code: '\\Im', keywords: 'imaginary part' },
  { symbol: '\\( \\wp \\)', code: '\\wp', keywords: 'weierstrass p elliptic function' },
  { symbol: '\\( x^\\circ \\)', code: 'x^\\circ', keywords: 'degree angle measure temperature polar coordinates' },
  { symbol: '\\( \\prime \\)', code: '\\prime', keywords: 'derivative notation function mark' },
  { symbol: '\\( \\nexists \\)', code: '\\nexists', keywords: 'does not exist negation logic quantifier' },
  { symbol: '\\( \\imath \\)', code: '\\imath', keywords: 'dotless i imaginary unit' },
  { symbol: '\\( \\jmath \\)', code: '\\jmath', keywords: 'dotless j imaginary unit' },
  { symbol: '\\( \\text{...} \\)', code: '\\text{...}', keywords: 'ellipsis inline mode normal' },
  { symbol: '\\( \\operatorname{foo} \\)', code: '\\operatorname{foo}', keywords: 'custom function' },
  { symbol: '\\( \\triangleq \\)', code: '\\triangleq', keywords: 'equals definition equal by def' },
  { symbol: '\\( \\blacksquare \\)', code: '\\blacksquare', keywords: 'end proof qed solid' },
  { symbol: '\\( \\blacktriangle \\)', code: '\\blacktriangle', keywords: 'up filled solid north' },
  { symbol: '\\( \\blacktriangledown \\)', code: '\\blacktriangledown', keywords: 'filled solid south' },
  { symbol: '\\( \\blacktriangleleft \\)', code: '\\blacktriangleleft', keywords: 'filled solid west' },
  { symbol: '\\( \\blacktriangleright \\)', code: '\\blacktriangleright', keywords: 'filled solid east' },
  { symbol: '\\( \\circledast \\)', code: '\\circledast', keywords: 'asterisk star operator convolution' },
  { symbol: '\\( \\circledcirc \\)', code: '\\circledcirc', keywords: 'ring operator' },
  { symbol: '\\( \\circleddash \\)', code: '\\circleddash', keywords: 'minus operator' },
  { symbol: '\\( \\lozenge \\)', code: '\\lozenge', keywords: 'diamond hollow rhombus' },
  { symbol: '\\( \\blacklozenge \\)', code: '\\blacklozenge', keywords: 'diamond solid rhombus filled' },
  { symbol: '\\( \\diagdown \\)', code: '\\diagdown', keywords: 'diagonal slash backslash' },
  { symbol: '\\( \\diagup \\)', code: '\\diagup', keywords: 'diagonal slash forward' },
  { symbol: '\\( \\surd \\)', code: '\\surd', keywords: 'square root radical check mark' },
  { symbol: '\\( \\mho \\)', code: '\\mho', keywords: 'inverted ohm conductance siemens' },
  { symbol: '\\( \\beth \\)', code: '\\beth', keywords: 'cardinal number hebrew letter' },
  { symbol: '\\( \\gimel \\)', code: '\\gimel', keywords: 'cardinal number hebrew letter' },
  { symbol: '\\( \\daleth \\)', code: '\\daleth', keywords: 'cardinal number hebrew letter' },
  { symbol: '\\( \\eth \\)', code: '\\eth', keywords: 'old english icelandic letter' },
  { symbol: '\\( \\digamma \\)', code: '\\digamma', keywords: 'archaic greek' },
  { symbol: '\\( \\varkappa \\)', code: '\\varkappa', keywords: 'variant' },
  { symbol: '\\( \\hslash \\)', code: '\\hslash', keywords: 'bar planck constant' },
  { symbol: '\\( \\maltese \\)', code: '\\maltese', keywords: 'cross' },
  { symbol: '\\( \\yen \\)', code: '\\yen', keywords: 'currency money japan' },
  { symbol: '\\( \\checkmark \\)', code: '\\checkmark', keywords: 'tick' },
  { symbol: '\\( \\circledR \\)', code: '\\circledR', keywords: 'registered trademark' },
  { symbol: '\\( \\circledS \\)', code: '\\circledS', keywords: 'service mark' },
  { symbol: '\\( \\Re \\)', code: '\\Re', keywords: 'real part' },
  { symbol: '\\( \\aleph \\)', code: '\\aleph', keywords: 'infinity cardinality' },
  { symbol: '\\( \\hbar \\)', code: '\\hbar', keywords: 'planck constant quantum' }
];

function selectSymbolRow(tr, code) {
  if (selectedSymbolRow) selectedSymbolRow.classList.remove('selected');
  selectedSymbolRow = tr;
  selectedSymbolCode = `$${code}$`;
  tr.classList.add('selected');
  const enable = isNoteSelectedAndEditable();
  mathSymbolsModalInsertBtn.disabled = !enable;
  mathSymbolsModalInsertBtn.style.cursor = enable ? '' : 'not-allowed';
}

mathSymbolsModalInsertBtn.onclick = function() {
  if (!selectedSymbolCode || markdownInput.readOnly) return;
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const value = markdownInput.value;
  markdownInput.value = value.substring(0, start) + selectedSymbolCode + value.substring(end);
  markdownInput.selectionStart = markdownInput.selectionEnd = start + selectedSymbolCode.length;
  markdownInput.focus();
  renderMarkdownWithMath(markdownInput.value);
  if (currentNoteKey && notesData[currentNoteKey] && !isNoteOrAncestorDeleted(currentNoteKey)) {
    notesData[currentNoteKey].content = markdownInput.value;
  }
  saveAppDataDebounced();
  mathSymbolsModalBg.classList.remove('show');
};

let mathSymbolsFiltered = mathSymbolsList.slice();
function fillMathSymbolsTable(filter = '') {
  mathSymbolsTable.innerHTML = '';
  selectedSymbolRow = null;
  selectedSymbolCode = null;
  mathSymbolsModalInsertBtn.disabled = true;

  let filterLower = (filter || '').toLowerCase();
  let filterWords = filterLower.split(/\s+/).filter(Boolean);

  mathSymbolsFiltered = mathSymbolsList.slice();

  if (filterWords.length > 0) {
    mathSymbolsFiltered = mathSymbolsFiltered.filter(item => {
      const searchableWords = (
        (item.code?.toLowerCase() || '') + ' ' +
        (item.symbol?.toLowerCase() || '') + ' ' +
        (item.keywords?.toLowerCase() || '')
      ).split(/\s+/).filter(Boolean);

      return filterWords.every(word =>
        searchableWords.some(sw => sw.startsWith(word))
      );
    });
  }

  if (filterWords.length > 0) {
    mathSymbolsFiltered.sort((a, b) => {
      function matchCount(item) {
        const searchableWords = (
          (item.code?.toLowerCase() || '') + ' ' +
          (item.symbol?.toLowerCase() || '') + ' ' +
          (item.keywords?.toLowerCase() || '')
        ).split(/\s+/).filter(Boolean);
        return filterWords.reduce((acc, word) =>
          acc + (searchableWords.some(sw => sw.startsWith(word)) ? 1 : 0), 0);
      }
      return matchCount(b) - matchCount(a);
    });
  }

  mathSymbolsFiltered.forEach((item) => {
    const tr = document.createElement('tr');
    const tdSymbol = document.createElement('td');
    tdSymbol.innerHTML = item.symbol;
    tdSymbol.style.fontFamily = 'serif';
    tdSymbol.title = 'Symbol';
    const tdCode = document.createElement('td');
    tdCode.textContent = item.code;
    tdCode.style.fontFamily = 'monospace';
    tdCode.title = 'LaTeX Code';

    tr.tabIndex = 0;
    tr.addEventListener('click', function() {
      selectSymbolRow(tr, item.code);
    });
    tr.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        selectSymbolRow(tr, item.code);
        e.preventDefault();
      }
    });

    tr.appendChild(tdSymbol);
    tr.appendChild(tdCode);
    mathSymbolsTable.appendChild(tr);
  });

  if (window.MathJax) {
    MathJax.typesetPromise([mathSymbolsTable]);
  }
}

mathSymbolsSearch.addEventListener('input', function() {
  fillMathSymbolsTable(this.value);
});

if (window.api) {
  window.api.on('menu-insert-math-symbols', () => {
    closeAllModals();
    mathSymbolsSearch.value = '';
    fillMathSymbolsTable();
    mathSymbolsModalInsertBtn.disabled = true;
    mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
    mathSymbolsModalBg.classList.add('show');
    // Focus immediately (no 100ms timeout)
    focusAndPlaceCaretEnd(mathSymbolsSearch);
  });
}

mathSymbolsModalCancelBtn.onclick = function() {
  mathSymbolsModalBg.classList.remove('show');
  selectedSymbolRow = null;
  selectedSymbolCode = null;
  mathSymbolsModalInsertBtn.disabled = true;
  mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
};
mathSymbolsModalBg.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    mathSymbolsModalBg.classList.remove('show');
    selectedSymbolRow = null;
    selectedSymbolCode = null;
    mathSymbolsModalInsertBtn.disabled = true;
    mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
  }

  if (e.key === 'Enter') {
    // If focus is on the cancel button, activate cancel instead of insert
    if (document.activeElement === mathSymbolsModalCancelBtn) {
      mathSymbolsModalCancelBtn.click();
      return;
    }
    if (selectedSymbolRow && !mathSymbolsModalInsertBtn.disabled) {
      e.preventDefault();
      mathSymbolsModalInsertBtn.click();
      return;
    }
  }

  if (e.key === 'Escape') {
    mathSymbolsModalCancelBtn.click();
  }

  if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
    const rows = Array.from(mathSymbolsTable.querySelectorAll('tr'));
    if (!rows.length) return;
    let idx = selectedSymbolRow ? rows.indexOf(selectedSymbolRow) : -1;
    if (e.key === 'ArrowDown') idx = Math.min(idx + 1, rows.length - 1);
    if (e.key === 'ArrowUp') idx = Math.max(idx - 1, 0);
    if (rows[idx]) {
      selectSymbolRow(rows[idx], rows[idx].querySelectorAll('td')[1].textContent);
      rows[idx].focus();
    }
    e.preventDefault();
  }

  if (e.key === 'Tab') {
    const rows = Array.from(mathSymbolsTable.querySelectorAll('tr'));
    const focusables = [
      mathSymbolsSearch,
      ...rows,
      mathSymbolsModalCancelBtn
    ].filter(Boolean);

    if (!focusables.length) return;

    e.preventDefault();
    e.stopPropagation();

    let activeEl = document.activeElement;
    if (!focusables.includes(activeEl)) {
      const rowEl = activeEl?.closest?.('tr');
      if (rowEl && focusables.includes(rowEl)) activeEl = rowEl;
    }

    let idx = focusables.indexOf(activeEl);
    if (e.shiftKey) {
      idx = (idx <= 0) ? focusables.length - 1 : idx - 1;
    } else {
      idx = (idx === -1 || idx === focusables.length - 1) ? 0 : idx + 1;
    }

    const nextEl = focusables[idx];
    nextEl.focus();
    mathSymbolsModalBg.classList.add('keyboard-nav');

    if (rows.includes(nextEl)) {
      const codeCell = nextEl.querySelectorAll('td')[1];
      if (codeCell) selectSymbolRow(nextEl, codeCell.textContent);
    } else if (selectedSymbolRow) {
      selectedSymbolRow.classList.remove('selected');
      selectedSymbolRow = null;
      selectedSymbolCode = null;
      mathSymbolsModalInsertBtn.disabled = true;
      mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
    }
  }
});

// Add: only show keyboard focus styles when user is tabbing (not when clicking)
(function() {
  // When user presses Tab, mark that they're using keyboard navigation
  function handleFirstTab(e) {
    if (e.key === 'Tab') {
      document.body.classList.add('user-is-tabbing');
      window.removeEventListener('keydown', handleFirstTab);
      // Reinstall a listener to detect mouse use afterwards
      window.addEventListener('mousedown', handleMouseDownOnce, { once: true });
      window.addEventListener('touchstart', handleMouseDownOnce, { once: true });
    }
  }

  function handleMouseDownOnce() {
    document.body.classList.remove('user-is-tabbing');
    // Reinstall the initial Tab listener
    window.addEventListener('keydown', handleFirstTab);
  }

  // Start listening
  window.addEventListener('keydown', handleFirstTab);
})();

// --- NOTE DATA, SELECTION, AND STORAGE ---
let currentNoteKey = null;
let noteIdCounter = 1;
const notesData = {};
function generateNoteId() {
  return 'note-' + (noteIdCounter++);
}

function clearCurrentSelection() {
  currentNoteKey = null;
  setActiveHeader(null);
  updateNoteContentEditable();
}

function snapshotOpenStateFromDom(rootLi) {
  const openState = new Map();
  if (!rootLi) return openState;
  if (rootLi.matches && rootLi.matches('li[data-note-id]')) {
    openState.set(rootLi.getAttribute('data-note-id'), rootLi.classList.contains('open'));
  }
  rootLi.querySelectorAll?.('li[data-note-id]')?.forEach((li) => {
    openState.set(li.getAttribute('data-note-id'), li.classList.contains('open'));
  });
  return openState;
}

function applyOpenStateToDom(rootLi, openState) {
  if (!rootLi || !openState) return;
  const allLis = [];
  if (rootLi.matches && rootLi.matches('li[data-note-id]')) allLis.push(rootLi);
  rootLi.querySelectorAll?.('li[data-note-id]')?.forEach((li) => allLis.push(li));

  for (const li of allLis) {
    const id = li.getAttribute('data-note-id');
    if (!openState.has(id)) continue;

    if (openState.get(id)) li.classList.add('open');
    else li.classList.remove('open');

    // Ensure arrow glyph matches the open/closed state (class change won't trigger the childList observers).
    const arrow = li.querySelector?.(':scope > .note-header .arrow');
    const notesList = li.querySelector?.(':scope > ul.notes');
    if (arrow && notesList && notesList.children.length > 0) {
      arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
    }
  }
}

function isInSubtree(candidateId, rootId) {
  if (!candidateId || !rootId) return false;
  if (candidateId === rootId) return true;
  const seen = new Set();
  let cur = candidateId;
  while (cur && notesData[cur] && !seen.has(cur)) {
    seen.add(cur);
    cur = notesData[cur]?.parent;
    if (cur === rootId) return true;
  }
  return false;
}

const deletedNotes = new Set();

function markDescendantsDeleted(noteId) {
  deletedNotes.add(noteId);
  for (const id in notesData) {
    if (notesData[id].parent === noteId) {
      markDescendantsDeleted(id);
    }
  }
}

function isNoteOrAncestorDeleted(noteId) {
  let cur = noteId;
  while (cur) {
    if (deletedNotes.has(cur)) return true;
    cur = notesData[cur]?.parent;
  }
  return false;
}

function isNoteSelectedAndEditable() {
  return (
    currentNoteKey &&
    notesData[currentNoteKey] &&
    !notesData[currentNoteKey].inTrash &&
    currentNoteKey !== TRASH_ID &&
    !isNoteOrAncestorDeleted(currentNoteKey)
  );
}

const markdownInput = document.getElementById('markdownInput');
const previewPane = document.getElementById('previewPane');
const editorPane = document.getElementById('editorPane');
const sidebar = document.getElementById('sidebar');
const layoutContainer = document.querySelector('.layout-container');
const sidebarResizer = document.getElementById('sidebarResizer');
const exportToolbar = document.getElementById('exportToolbar');
const exportInlineSelectAll = document.getElementById('exportInlineSelectAll');
const exportInlineConfirm = document.getElementById('exportInlineConfirm');
const exportInlineCancel = document.getElementById('exportInlineCancel');
const exportSelectRow = document.getElementById('exportSelectRow');
const exportCheckboxInputs = new Map();
const exportSelectionMap = new Map();
let exportModeActive = false;
const DEFAULT_EXPORT_SELECTION = true;

let renderDebounceTimer = null;
let pendingRenderText = null;
let isRendering = false;

function renderMarkdownWithMath(text) {
  if (isRendering) return;
  isRendering = true;
  
  const html = marked.parse(text || '');
  const safe = (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function')
    ? window.DOMPurify.sanitize(html)
    : html;
  
  // Use requestAnimationFrame to batch DOM updates
  requestAnimationFrame(() => {
    previewPane.innerHTML = safe;
    isRendering = false;
    
    // Defer MathJax rendering to avoid blocking
    if (window.MathJax) {
      requestAnimationFrame(() => {
        try {
          MathJax.typesetClear([previewPane]);
          MathJax.typesetPromise([previewPane]).catch(() => {
            // Ignore MathJax errors to prevent blocking
          });
        } catch (e) {
          // Ignore errors
        }
      });
    }
  });
}

function renderMarkdownWithMathDebounced(text) {
  pendingRenderText = text;
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer);
  }
  renderDebounceTimer = setTimeout(() => {
    if (pendingRenderText !== null) {
      renderMarkdownWithMath(pendingRenderText);
      pendingRenderText = null;
    }
    renderDebounceTimer = null;
  }, 200);
}

markdownInput.addEventListener('input', () => {
  renderMarkdownWithMathDebounced(markdownInput.value);
  if (currentNoteKey && notesData[currentNoteKey] && !isNoteOrAncestorDeleted(currentNoteKey)) {
    notesData[currentNoteKey].content = markdownInput.value;
  }
  saveAppDataDebounced();
});

function updateNoteContentEditable() {
  if (!currentNoteKey || !notesData[currentNoteKey] || isNoteOrAncestorDeleted(currentNoteKey)) {
    editorPane.classList.add('disabled');
    previewPane.classList.add('disabled');
    markdownInput.value = '## No note is currently selected';
    previewPane.innerHTML = '<h2>No note is currently selected</h2>';
    markdownInput.setAttribute('readonly', 'readonly');
    markdownInput.setAttribute('placeholder', '');
    if (mathSymbolsModalBg && mathSymbolsModalInsertBtn) {
      mathSymbolsModalInsertBtn.disabled = true;
      mathSymbolsModalInsertBtn.style.cursor = 'not-allowed';
    }
  } else {
    editorPane.classList.remove('disabled');
    previewPane.classList.remove('disabled');
    markdownInput.removeAttribute('readonly');
    markdownInput.value = notesData[currentNoteKey]?.content || '';
    renderMarkdownWithMath(markdownInput.value);
    markdownInput.setAttribute('placeholder', 'Type Markdown + LaTeX here...');
    if (mathSymbolsModalBg && mathSymbolsModalInsertBtn) {
      const enable = selectedSymbolRow && isNoteSelectedAndEditable();
      mathSymbolsModalInsertBtn.disabled = !enable;
      mathSymbolsModalInsertBtn.style.cursor = enable ? '' : 'not-allowed';
    }
  }
}

addNoteBtn.addEventListener('click', async () => {
const noteName = await showModal({ title: 'Title', initialValue: '', depth: 0 });
  if (!noteName) return;
  const li = createNotebookElement(noteName);
  noteList.insertBefore(li, noteList.firstChild);
  ensureTrashAtBottom();
  saveAppDataDebounced();
});

function createNotebookElement(notebookName, existingId = null) {
  const notebookId = existingId || generateNoteId();
  if (!notesData[notebookId]) {
    notesData[notebookId] = { content: '', title: notebookName, parent: null };
  } else {
    notesData[notebookId].title = notebookName;
    notesData[notebookId].parent = null;
    delete notesData[notebookId].inTrash;
    delete notesData[notebookId].originalParent;
  }
  const li = document.createElement('li');
  li.classList.add('has-notes');
  li.setAttribute('data-note-id', notebookId);
  const leftGroup = document.createElement('div');
  leftGroup.className = 'left-group';
  const arrow = document.createElement('span');
  arrow.classList.add('arrow');
  arrow.textContent = '';
  arrow.style.display = 'inline-block';
  arrow.style.width = '1em';
  arrow.style.minWidth = '1em';
  arrow.style.textAlign = 'center';
  arrow.style.marginRight = '4px';
  arrow.style.color = 'white';
  arrow.style.fontSize = '0.75rem';
  arrow.style.marginLeft = '0';
  arrow.style.visibility = 'hidden';
  arrow.style.pointerEvents = 'none';

  // --- ADDED: accessible role, initial tabIndex, and keyboard handler ---
  arrow.setAttribute('role', 'button');
  arrow.tabIndex = -1; // observer will flip to 0 when visible
  arrow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      // toggle open/close but do NOT move focus into subnotes
      toggleNotes(arrow);
    }
  });

  leftGroup.appendChild(arrow);
  const title = document.createElement('span');
  title.classList.add('title');
  title.textContent = notebookName;
  applyTitleMaxWidth(title, getDepth(notebookId));
  const subCount = document.createElement('span');
  subCount.className = 'subnote-count';
  subCount.style.color = '#bbb';
  subCount.style.fontSize = '0.75em';
  subCount.style.marginLeft = '4px';
  subCount.style.fontWeight = '400';
  subCount.style.display = 'none';
  leftGroup.appendChild(title);
  leftGroup.appendChild(subCount);
  const actions = document.createElement('div');
  actions.classList.add('actions');
  const checkboxWrapper = createExportCheckbox(notebookId);
  actions.appendChild(checkboxWrapper);
  const editTitleBtn = document.createElement('button');
  editTitleBtn.textContent = "✎";
  editTitleBtn.title = "Edit Title";
  editTitleBtn.className = "edit-title-btn";
  editTitleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newTitle = await showModal({ title: 'Title', initialValue: title.textContent, depth: 0 });
    if (newTitle) {
      title.textContent = newTitle;
      notesData[notebookId].title = newTitle;
      saveAppDataDebounced();
    }
  });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+';
  addBtn.title = "Add Note";
  addBtn.className = "plus-btn";
  addBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const noteName = await showModal({ title: 'Title', initialValue: '', depth: 1 });
    if (!noteName) return;
    const notesList = li.querySelector('.notes');
    const noteEl = createNoteElement(noteName, notebookId);
    // append to bottom instead of inserting at top
    notesList.appendChild(noteEl);
    if (!li.classList.contains('open')) {
      li.classList.add('open');
      arrow.textContent = '▼';
    }
    saveAppDataDebounced();
  });

  const deleteBtn = document.createElement('button');
  // replace '-' text with accessible inline SVG trash icon
  deleteBtn.innerHTML = '<span class="visually-hidden">Delete Notebook</span>' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="3 6 5 6 21 6"></polyline>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '</svg>';
  deleteBtn.title = "Delete Notebook";
  deleteBtn.className = "trash-btn";
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await showDeleteModal(title.textContent);
    if (!confirmed) return;

    const shouldClearSelection = currentNoteKey && isInSubtree(currentNoteKey, notebookId);
    moveToTrash(notebookId);
    li.remove();
    if (shouldClearSelection || currentNoteKey === notebookId) {
      clearCurrentSelection();
    }
    ensureTrashAtBottom();
    saveAppDataDebounced();
  });

  actions.appendChild(editTitleBtn);
  actions.appendChild(addBtn);
  actions.appendChild(deleteBtn);

  const header = document.createElement('div');
  header.classList.add('note-header');
  header.appendChild(leftGroup);
  header.appendChild(actions);

  // --- ADDED: make header keyboard-focusable but DO NOT intercept button events ---
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.addEventListener('keydown', function (e) {
    // If the key event originated from a button/control inside the header, ignore it
    if (e.target.closest && (e.target.closest('.actions') || e.target.tagName === 'BUTTON')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });

  header.setAttribute('draggable', 'true');
  header.addEventListener('dragstart', e => {
    li.classList.add('dragging');
    window.__draggedNote = li;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  header.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    window.__draggedNote = null;
    clearAllDropClasses(); // Clear all drop classes when drag ends
  });
  header.addEventListener('click', function (e) {
    if (
      e.target.closest('.actions') ||
      e.target.tagName === 'BUTTON' ||
      e.target.classList.contains('arrow')
    ) return;
    setActiveHeader(header);
    selectNote(notebookId);
  });
  const notesList = document.createElement('ul');
  notesList.classList.add('notes');
  li.appendChild(header);
  li.appendChild(notesList);
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent parent handlers from firing
    e.dataTransfer.dropEffect = 'move';
    const dragged = window.__draggedNote;
    if (!dragged || dragged === li) {
      // remove any residual hints
      clearAllDropClasses();
      return;
    }
    // prevent showing drop hints if dropping into own descendant
    if (dragged.contains(li)) {
      clearAllDropClasses();
      return;
    }

    const rect = li.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const h = Math.max(rect.height, 1);
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;

    // Clear all drop classes from all elements first to ensure only one is highlighted
    clearAllDropClasses();

    if (offsetY < topZone) {
      li.classList.add('drop-above');
    } else if (offsetY > bottomZone) {
      li.classList.add('drop-below');
    } else {
      li.classList.add('drop-inside');
    }
  });

  li.addEventListener('dragleave', (e) => {
    // Remove hints when leaving the li
    // Some browsers fire dragleave when moving between children, so check relatedTarget
    // Also account for blue lines which are positioned outside element bounds
    const relatedTarget = e.relatedTarget;
    
    // Check if we're leaving the element and not just moving to a child
    if (relatedTarget && li.contains(relatedTarget)) {
      return; // Moving to a child, don't remove classes
    }
    
    // Check if mouse is still near the element (accounting for blue line area at -4px)
    const rect = li.getBoundingClientRect();
    const mouseY = e.clientY;
    const mouseX = e.clientX;
    
    // Account for blue line area: extend bounds by 4px on top and bottom
    const extendedTop = rect.top - 4;
    const extendedBottom = rect.bottom + 4;
    const extendedLeft = rect.left;
    const extendedRight = rect.right;
    
    // If mouse is still within extended bounds (including blue line area), don't remove classes
    if (mouseY >= extendedTop && mouseY <= extendedBottom &&
        mouseX >= extendedLeft && mouseX <= extendedRight) {
      return; // Still within element area including blue lines
    }
    
    // Only remove if we're truly leaving the element
    li.classList.remove('drop-above', 'drop-inside', 'drop-below');
  });

  // REPLACED: smarter drop handling (top 25% = above, middle 50% = inside, bottom 25% = below)
  li.addEventListener('drop', e => {
    e.preventDefault();
    const targetLi = li;
    const dragged = window.__draggedNote;
    // clear visual cues immediately
    targetLi.classList.remove('drop-above', 'drop-inside', 'drop-below');

    if (!dragged || dragged === targetLi) return;

    // Don't allow dropping onto a descendant of the dragged node
    if (dragged.contains(targetLi)) return;

    const rect = targetLi.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const h = rect.height || 1;
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;

    const draggedId = dragged.getAttribute && dragged.getAttribute('data-note-id');

    if (offsetY < topZone) {
      // Insert above target in same list
      const parentUl = targetLi.parentNode;
      parentUl.insertBefore(dragged, targetLi);
      const parentLi = parentUl.closest && parentUl.closest('li.has-notes');
      const newParentId = parentLi ? parentLi.getAttribute('data-note-id') : null;
      if (draggedId) notesData[draggedId].parent = newParentId;
    } else if (offsetY > bottomZone) {
      // Insert below target in same list
      const parentUl = targetLi.parentNode;
      parentUl.insertBefore(dragged, targetLi.nextSibling);
      const parentLi = parentUl.closest && parentUl.closest('li.has-notes');
      const newParentId = parentLi ? parentLi.getAttribute('data-note-id') : null;
      if (draggedId) notesData[draggedId].parent = newParentId;
    } else {
      // Middle: drop inside target => become its child
      let notesList = targetLi.querySelector('.notes');
      if (!notesList) {
        notesList = document.createElement('ul');
        notesList.classList.add('notes');
        targetLi.appendChild(notesList);
      }
      notesList.appendChild(dragged);
      targetLi.classList.add('open');
      const targetArrow = targetLi.querySelector('.arrow');
      if (targetArrow) targetArrow.textContent = '▼';
      if (draggedId) notesData[draggedId].parent = targetLi.getAttribute('data-note-id');
    }

    // Update spacing for the moved note and all its descendants
    updateNoteSpacing(dragged);

    // Clear dragging state
    if (dragged.classList) dragged.classList.remove('dragging');
    window.__draggedNote = null;
    saveAppDataDebounced();
  });

  const updateSubCount = () => {
    const count = notesList.children.length;
    if (count > 0) {
      subCount.textContent = `(${count})`;
      subCount.style.display = '';
    } else {
      subCount.textContent = '';
      subCount.style.display = 'none';
    }
  };
  const observer = new MutationObserver(() => {
    if (notesList.children.length > 0) {
      arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      arrow.style.visibility = 'visible';
      arrow.style.pointerEvents = 'auto';
      arrow.style.cursor = 'pointer';
      // make arrow tabbable when visible
      arrow.tabIndex = 0;
      arrow.onclick = function(e) {
        e.stopPropagation();
        toggleNotes(arrow);
        arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      };
    } else {
      arrow.textContent = '';
      arrow.style.visibility = 'hidden';
      arrow.style.pointerEvents = 'none';
      // remove from tab order when hidden
      arrow.tabIndex = -1;
      arrow.onclick = null;
      li.classList.remove('open');
    }
    updateSubCount();
  });
  observer.observe(notesList, { childList: true });
  updateSubCount();
  if (exportModeActive) {
    updateExportSelectAllState();
    updateExportConfirmButtonState();
  }
  return li;
}

function createNoteElement(noteName, parentNotebookId, existingId = null) {
  const noteId = existingId || generateNoteId();
  if (!notesData[noteId]) {
    notesData[noteId] = { content: '', title: noteName, parent: parentNotebookId };
  } else {
    notesData[noteId].title = noteName;
    notesData[noteId].parent = parentNotebookId;
    delete notesData[noteId].inTrash;
    delete notesData[noteId].originalParent;
  }
  const li = document.createElement('li');
  li.classList.add('has-notes');
  li.setAttribute('data-note-id', noteId);
  const leftGroup = document.createElement('div');
  leftGroup.className = 'left-group';
  const arrow = document.createElement('span');
  arrow.classList.add('arrow');
  arrow.textContent = '';
  arrow.style.display = 'inline-block';
  arrow.style.width = '1em';
  arrow.style.minWidth = '1em';
  arrow.style.textAlign = 'center';
  arrow.style.marginRight = '4px';
  arrow.style.color = 'white';
  arrow.style.fontSize = '0.75rem';
  arrow.style.marginLeft = '0';
  arrow.style.visibility = 'hidden';
  arrow.style.pointerEvents = 'none';

  // --- ADDED: accessible role, initial tabIndex, keyboard handler ---
  arrow.setAttribute('role', 'button');
  arrow.tabIndex = -1;
  arrow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleNotes(arrow);
    }
  });

  leftGroup.appendChild(arrow);
  const title = document.createElement('span');
  title.classList.add('title');
  title.textContent = noteName;
  const depth = getDepth(noteId);
  title.style.marginLeft = (depth * 10) + 'px';
  applyTitleMaxWidth(title, depth);
  const subCount = document.createElement('span');
  subCount.className = 'subnote-count';
  subCount.style.color = '#bbb';
  subCount.style.fontSize = '.75em';
  subCount.style.marginLeft = '4px';
  subCount.style.fontWeight = '400';
  subCount.style.display = 'none';
  leftGroup.appendChild(title);
  leftGroup.appendChild(subCount);
  const actions = document.createElement('div');
  actions.classList.add('actions');
  const checkboxWrapper = createExportCheckbox(noteId);
  actions.appendChild(checkboxWrapper);
  const editTitleBtn = document.createElement('button');
  editTitleBtn.textContent = "✎";
  editTitleBtn.title = "Edit Title";
  editTitleBtn.className = "edit-title-btn";
  editTitleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newTitle = await showModal({ title: 'Title', initialValue: title.textContent, depth });
    if (newTitle) {
      title.textContent = newTitle;
      notesData[noteId].title = newTitle;
      saveAppDataDebounced();
    }
  });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+';
  addBtn.title = "Add Note";
  addBtn.className = "plus-btn";
  addBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newNoteName = await showModal({ title: 'Title', initialValue: '', depth: depth + 1 });
    if (!newNoteName) return;
    const notesList = li.querySelector('.notes');
    const noteEl = createNoteElement(newNoteName, noteId);
    // append to bottom so subnotes appear after existing ones
    notesList.appendChild(noteEl);
    if (!li.classList.contains('open')) {
      li.classList.add('open');
      arrow.textContent = '▼';
    }
  });

  const deleteBtn = document.createElement('button');
  // replace '-' text with accessible inline SVG trash icon
  deleteBtn.innerHTML = '<span class="visually-hidden">Delete Note</span>' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="3 6 5 6 21 6"></polyline>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '</svg>';
  deleteBtn.title = "Delete Note";
  deleteBtn.className = "trash-btn";
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await showDeleteModal(title.textContent);
    if (!confirmed) return;

    const shouldClearSelection = currentNoteKey && isInSubtree(currentNoteKey, noteId);
    moveToTrash(noteId);
    li.remove();
    if (shouldClearSelection || currentNoteKey === noteId) {
      clearCurrentSelection();
    }
    ensureTrashAtBottom();
  });

  actions.appendChild(editTitleBtn);
  actions.appendChild(addBtn);
  actions.appendChild(deleteBtn);

  const header = document.createElement('div');
  header.classList.add('note-header');
  header.appendChild(leftGroup);
  header.appendChild(actions);

  // --- ADDED: header tabbable but ignore key events from inner buttons ---
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.addEventListener('keydown', function (e) {
    if (e.target.closest && (e.target.closest('.actions') || e.target.tagName === 'BUTTON')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });

  header.setAttribute('draggable', 'true');
  header.addEventListener('dragstart', e => {
    li.classList.add('dragging');
    window.__draggedNote = li;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  header.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    window.__draggedNote = null;
    clearAllDropClasses(); // Clear all drop classes when drag ends
  });
  header.addEventListener('click', function (e) {
    if (
      e.target.closest('.actions') ||
      e.target.tagName === 'BUTTON' ||
      e.target.classList.contains('arrow')
    ) return;
    setActiveHeader(header);
    selectNote(noteId);
  });
  const notesList = document.createElement('ul');
  notesList.classList.add('notes');
  li.appendChild(header);
  li.appendChild(notesList);
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent parent handlers from firing
    e.dataTransfer.dropEffect = 'move';
    const dragged = window.__draggedNote;
    if (!dragged || dragged === li) {
      // remove any residual hints
      clearAllDropClasses();
      return;
    }
    // prevent showing drop hints if dropping into own descendant
    if (dragged.contains(li)) {
      clearAllDropClasses();
      return;
    }

    const rect = li.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const h = Math.max(rect.height, 1);
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;

    // Clear all drop classes from all elements first to ensure only one is highlighted
    clearAllDropClasses();

    if (offsetY < topZone) {
      li.classList.add('drop-above');
    } else if (offsetY > bottomZone) {
      li.classList.add('drop-below');
    } else {
      li.classList.add('drop-inside');
    }
  });

  li.addEventListener('dragleave', (e) => {
    // Remove hints when leaving the li
    // Some browsers fire dragleave when moving between children, so check relatedTarget
    // Also account for blue lines which are positioned outside element bounds
    const relatedTarget = e.relatedTarget;
    
    // Check if we're leaving the element and not just moving to a child
    if (relatedTarget && li.contains(relatedTarget)) {
      return; // Moving to a child, don't remove classes
    }
    
    // Check if mouse is still near the element (accounting for blue line area at -4px)
    const rect = li.getBoundingClientRect();
    const mouseY = e.clientY;
    const mouseX = e.clientX;
    
    // Account for blue line area: extend bounds by 4px on top and bottom
    const extendedTop = rect.top - 4;
    const extendedBottom = rect.bottom + 4;
    const extendedLeft = rect.left;
    const extendedRight = rect.right;
    
    // If mouse is still within extended bounds (including blue line area), don't remove classes
    if (mouseY >= extendedTop && mouseY <= extendedBottom &&
        mouseX >= extendedLeft && mouseX <= extendedRight) {
      return; // Still within element area including blue lines
    }
    
    // Only remove if we're truly leaving the element
    li.classList.remove('drop-above', 'drop-inside', 'drop-below');
  });

  // REPLACED: smarter drop handling (top 25% = above, middle 50% = inside, bottom 25% = below)
  li.addEventListener('drop', e => {
    e.preventDefault();
    const targetLi = li;
    const dragged = window.__draggedNote;
    // clear visual cues immediately
    targetLi.classList.remove('drop-above', 'drop-inside', 'drop-below');

    if (!dragged || dragged === targetLi) return;

    // Don't allow dropping onto a descendant of the dragged node
    if (dragged.contains(targetLi)) return;

    const rect = targetLi.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const h = rect.height || 1;
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;

    const draggedId = dragged.getAttribute && dragged.getAttribute('data-note-id');

    if (offsetY < topZone) {
      // Insert above target in same list
      const parentUl = targetLi.parentNode;
      parentUl.insertBefore(dragged, targetLi);
      const parentLi = parentUl.closest && parentUl.closest('li.has-notes');
      const newParentId = parentLi ? parentLi.getAttribute('data-note-id') : null;
      if (draggedId) notesData[draggedId].parent = newParentId;
    } else if (offsetY > bottomZone) {
      // Insert below target in same list
      const parentUl = targetLi.parentNode;
      parentUl.insertBefore(dragged, targetLi.nextSibling);
      const parentLi = parentUl.closest && parentUl.closest('li.has-notes');
      const newParentId = parentLi ? parentLi.getAttribute('data-note-id') : null;
      if (draggedId) notesData[draggedId].parent = newParentId;
    } else {
      // Middle: drop inside target => become its child
      let notesList = targetLi.querySelector('.notes');
      if (!notesList) {
        notesList = document.createElement('ul');
        notesList.classList.add('notes');
        targetLi.appendChild(notesList);
      }
      notesList.appendChild(dragged);
      targetLi.classList.add('open');
      const targetArrow = targetLi.querySelector('.arrow');
      if (targetArrow) targetArrow.textContent = '▼';
      if (draggedId) notesData[draggedId].parent = targetLi.getAttribute('data-note-id');
    }

    // Update spacing for the moved note and all its descendants
    updateNoteSpacing(dragged);

    // Clear dragging state
    if (dragged.classList) dragged.classList.remove('dragging');
    window.__draggedNote = null;
    saveAppDataDebounced();
  });

  const updateSubCount = () => {
    const count = notesList.children.length;
    if (count > 0) {
      subCount.textContent = `(${count})`;
      subCount.style.display = '';
    } else {
      subCount.textContent = '';
      subCount.style.display = 'none';
    }
  };
  const observer = new MutationObserver(() => {
    if (notesList.children.length > 0) {
      arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      arrow.style.visibility = 'visible';
      arrow.style.pointerEvents = 'auto';
      arrow.style.cursor = 'pointer';
      // make arrow tabbable when visible
      arrow.tabIndex = 0;
      arrow.onclick = function(e) {
        e.stopPropagation();
        toggleNotes(arrow);
        arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      };
    } else {
      arrow.textContent = '';
      arrow.style.visibility = 'hidden';
      arrow.style.pointerEvents = 'none';
      // remove from tab order when hidden
      arrow.tabIndex = -1;
      arrow.onclick = null;
      li.classList.remove('open');
    }
    updateSubCount();
  });
  observer.observe(notesList, { childList: true });
  updateSubCount();
  if (exportModeActive) {
    updateExportSelectAllState();
    updateExportConfirmButtonState();
  }
  return li;
}

function rebuildNoteTree(noteId, li) {
  const notesList = li.querySelector('.notes');
  if (!notesList) return;
  const childIds = getOrderedChildren(noteId);
  childIds.forEach((childId) => {
    const child = notesData[childId];
    if (!child) return;
    const childLi = createNoteElement(child.title, noteId, childId);
    notesList.appendChild(childLi);
    rebuildNoteTree(childId, childLi);
  });
}

function selectNote(noteId) {
  if (currentNoteKey && notesData[currentNoteKey] && !isNoteOrAncestorDeleted(currentNoteKey)) {
    notesData[currentNoteKey].content = markdownInput.value;
  }
  currentNoteKey = noteId;

  if (noteId === TRASH_ID) {
    editorPane.classList.add('disabled');
    previewPane.classList.add('disabled');
    markdownInput.value = '';
    previewPane.innerHTML = '<h2>🗑️ Trash</h2><p>Deleted items appear here. Use "Recover" to restore them or "-" to delete permanently.</p>';
    markdownInput.setAttribute('readonly', 'readonly');
    markdownInput.setAttribute('placeholder', '');
    updatePreviewOnlyBtnVisibility();
    return;
  }

  if (notesData[noteId]?.inTrash) {
    editorPane.classList.add('disabled');
    previewPane.classList.add('disabled');
    markdownInput.value = notesData[noteId]?.content || '';
    renderMarkdownWithMath(markdownInput.value);
    markdownInput.setAttribute('readonly', 'readonly');
    markdownInput.setAttribute('placeholder', '');
    updatePreviewOnlyBtnVisibility();
    return;
  }

  updateNoteContentEditable();
  if (mathSymbolsModalBg && mathSymbolsModalInsertBtn) {
    const enable = selectedSymbolRow && isNoteSelectedAndEditable();
    mathSymbolsModalInsertBtn.disabled = !enable;
    mathSymbolsModalInsertBtn.style.cursor = enable ? '' : 'not-allowed';
  }
}

updateNoteContentEditable();

function toggleNotes(el) {
  const parent = el.closest('li');
  parent.classList.toggle('open');
  if (!parent.classList.contains('open')) {
    parent.querySelectorAll('li.has-notes').forEach(li => {
      li.classList.remove('open');
      const arrow = li.querySelector('.arrow');
      if (arrow) {
        const notesList = li.querySelector('.notes');
        arrow.textContent = (notesList && notesList.children.length > 0) ? '▶' : '';
      }
    });
  }
  const arrow = parent.querySelector('.arrow');
  if (arrow) {
    const notesList = parent.querySelector('.notes');
    arrow.textContent = parent.classList.contains('open')
      ? '▼'
      : (notesList && notesList.children.length > 0 ? '▶' : '');
  }
}

let currentActiveHeader = null;
function setActiveHeader(header) {
  if (currentActiveHeader) currentActiveHeader.classList.remove('active');
  currentActiveHeader = header;
  if (header) header.classList.add('active');
}

let isResizing = false;
let resizeAnimationFrame = null;
let lastResizeClientX = 0;
let cachedLayoutLeft = 0;

sidebarResizer?.addEventListener('mousedown', function (e) {
  isResizing = true;
  document.body.classList.add('resizing-sidebar');
  document.body.style.cursor = 'ew-resize';
  lastResizeClientX = e.clientX;
  // Cache layout position once at start to avoid expensive recalculations
  if (layoutContainer) {
    cachedLayoutLeft = layoutContainer.getBoundingClientRect().left;
  }
  e.preventDefault();
});
document.addEventListener('mousemove', function (e) {
  if (!isResizing) return;
  e.preventDefault();
  lastResizeClientX = e.clientX;
  if (resizeAnimationFrame) return;
  resizeAnimationFrame = requestAnimationFrame(() => {
    resizeAnimationFrame = null;
    if (!sidebar) return;
    // Use cached layout position instead of recalculating
    let newWidth = lastResizeClientX - cachedLayoutLeft - 14;
    const minSidebar = 110;
    const maxSidebar = Math.max(window.innerWidth - 860, minSidebar + 20);
    if (newWidth > minSidebar && newWidth < maxSidebar) {
      sidebar.style.width = newWidth + 'px';
    }
  });
});
document.addEventListener('mouseup', function () {
  if (!isResizing) return;
  isResizing = false;
  if (resizeAnimationFrame) {
    cancelAnimationFrame(resizeAnimationFrame);
    resizeAnimationFrame = null;
  }
  document.body.classList.remove('resizing-sidebar');
  document.body.style.cursor = '';
  // Clear cache after resize completes
  cachedLayoutLeft = 0;
});

const mainSplit = document.getElementById('mainSplit');
let previewOnly = false;

function togglePreviewMode() {
  previewOnly = !previewOnly;
  if (previewOnly) {
    mainSplit.classList.add('preview-only');
  } else {
    mainSplit.classList.remove('preview-only');
  }
}

if (window.api) {
  window.api.on('menu-toggle-preview', () => {
    togglePreviewMode();
  });
}

function updatePreviewOnlyBtnVisibility() {}

const _updateNoteContentEditable = updateNoteContentEditable;
updateNoteContentEditable = function() {
  _updateNoteContentEditable.apply(this, arguments);
  updatePreviewOnlyBtnVisibility();
};

function moveToTrash(noteId, isNested = false) {
  const note = notesData[noteId];
  if (!note) return [];

  if (!Object.prototype.hasOwnProperty.call(note, 'originalParent')) {
    note.originalParent = note.parent;
  }
  if (!isNested) note.parent = TRASH_ID;

  note.inTrash = true;
  note.trashedAt = Date.now();

  const trashedIds = [noteId];
  for (const id in notesData) {
    if (notesData[id]?.parent === noteId) {
      trashedIds.push(...moveToTrash(id, true));
    }
  }
  return trashedIds;
}

function recoverFromTrash(noteId) {
  const note = notesData[noteId];
  if (!note || !note.inTrash) return;

  const restoredParent = Object.prototype.hasOwnProperty.call(note, 'originalParent')
    ? note.originalParent
    : null;

  note.parent = restoredParent;
  delete note.originalParent;
  delete note.inTrash;
  delete note.trashedAt;

  for (const id in notesData) {
    if (notesData[id]?.inTrash && notesData[id]?.originalParent === noteId) {
      recoverFromTrash(id);
    }
  }
}

function permanentlyDelete(noteId) {
  if (!notesData[noteId]) return;

  const descendantIds = [];
  findAllDescendants(noteId, descendantIds);

  descendantIds.forEach(id => {
    delete notesData[id];
    cleanupExportTracking(id);
  });

  delete notesData[noteId];
  cleanupExportTracking(noteId);
}

function findAllDescendants(noteId, collectionArray) {
  for (const id in notesData) {
    if (notesData[id] && notesData[id].parent === noteId) {
      collectionArray.push(id);
      findAllDescendants(id, collectionArray);
    }
  }
}

function createTrashNotebook() {
  notesData[TRASH_ID] = { content: '', title: 'Trash', parent: null, isTrash: true };
  const li = document.createElement('li');
  li.classList.add('has-notes', 'trash-notebook');
  li.id = TRASH_ID;
  li.setAttribute('data-note-id', TRASH_ID);

  const leftGroup = document.createElement('div');
  leftGroup.className = 'left-group';

  const arrow = document.createElement('span');
  arrow.classList.add('arrow');
  arrow.textContent = '';
  arrow.style.display = 'inline-block';
  arrow.style.width = '1em';
  arrow.style.minWidth = '1em';
  arrow.style.textAlign = 'center';
  arrow.style.marginRight = '4px';
  arrow.style.color = 'white';
  arrow.style.fontSize = '0.75rem';
  arrow.style.marginLeft = '0';
  arrow.style.visibility = 'hidden';
  arrow.style.pointerEvents = 'none';

  arrow.setAttribute('role', 'button');
  arrow.tabIndex = -1;
  arrow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleNotes(arrow);
    }
  });
  leftGroup.appendChild(arrow);

  const trashIcon = document.createElement('span');
  trashIcon.style.marginRight = '6px';
  trashIcon.style.display = 'inline-block';
  trashIcon.style.verticalAlign = 'middle';
  trashIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>`;
  const title = document.createElement('span');
  title.classList.add('title');
  title.textContent = 'Trash';
  title.style.fontWeight = 'bold';
  title.style.verticalAlign = 'middle';

  const subCount = document.createElement('span');
  subCount.className = 'subnote-count';
  subCount.style.color = '#bbb';
  subCount.style.fontSize = '0.75em';
  subCount.style.marginLeft = '4px';
  subCount.style.fontWeight = '400';
  subCount.style.display = 'none';

  leftGroup.appendChild(trashIcon);
  leftGroup.appendChild(title);
  leftGroup.appendChild(subCount);

  const header = document.createElement('div');
  header.classList.add('note-header');
  header.appendChild(leftGroup);
  header.style.cursor = 'default';

  const notesList = document.createElement('ul');
  notesList.classList.add('notes');
  li.appendChild(header);
  li.appendChild(notesList);

  const observer = new MutationObserver(() => {
    const count = notesList.children.length;
    if (count > 0) {
      arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      arrow.style.visibility = 'visible';
      arrow.style.pointerEvents = 'auto';
      arrow.style.cursor = 'pointer';
      arrow.tabIndex = 0;
      arrow.onclick = function(e) {
        e.stopPropagation();
        toggleNotes(arrow);
        arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      };
      subCount.textContent = `(${count})`;
      subCount.style.display = '';
    } else {
      arrow.textContent = '';
      arrow.style.visibility = 'hidden';
      arrow.style.pointerEvents = 'none';
      arrow.tabIndex = -1;
      arrow.onclick = null;
      li.classList.remove('open');
      subCount.textContent = '';
      subCount.style.display = 'none';
    }
  });
  observer.observe(notesList, { childList: true });

  return li;
}

function createTrashedElement(noteId) {
  const note = notesData[noteId];
  if (!note) return null;

  const li = document.createElement('li');
  li.classList.add('trashed-item', 'has-notes');
  li.setAttribute('data-note-id', noteId);

  const leftGroup = document.createElement('div');
  leftGroup.className = 'left-group';

  const arrow = document.createElement('span');
  arrow.classList.add('arrow');
  arrow.textContent = '';
  arrow.style.display = 'inline-block';
  arrow.style.width = '1em';
  arrow.style.minWidth = '1em';
  arrow.style.textAlign = 'center';
  arrow.style.marginRight = '4px';
  arrow.style.color = 'white';
  arrow.style.fontSize = '0.75rem';
  arrow.style.marginLeft = '0';
  arrow.style.visibility = 'hidden';
  arrow.style.pointerEvents = 'none';

  // --- ADDED: accessible role, initial tabIndex, keyboard handler ---
  arrow.setAttribute('role', 'button');
  arrow.tabIndex = -1;
  arrow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleNotes(arrow);
    }
  });

  leftGroup.appendChild(arrow);

  const title = document.createElement('span');
  title.classList.add('title');
  title.textContent = note.title;
  title.style.color = '#999';
  title.style.textDecoration = 'none';
  leftGroup.appendChild(title);

  const subCount = document.createElement('span');
  subCount.className = 'subnote-count';
  subCount.style.color = '#bbb';
  subCount.style.fontSize = '0.75em';
  subCount.style.marginLeft = '4px';
  subCount.style.fontWeight = '400';
  subCount.style.display = 'none';
  leftGroup.appendChild(subCount);

  const actions = document.createElement('div');
  actions.classList.add('actions');

  const recoverBtn = document.createElement('button');
  recoverBtn.textContent = 'Recover';
  recoverBtn.title = "Recover Item";
  recoverBtn.className = "plus-btn";
  recoverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (recoverBtn.disabled) return;
    recoverBtn.disabled = true;

    const noteData = notesData[noteId];
    if (!noteData) return;
    noteData.originalParent = null;

    // Preserve the current open/closed state (as it looks right now in the Trash tree)
    // so the recovered tree keeps the same expanded/collapsed appearance.
    const openState = snapshotOpenStateFromDom(li);

    const selectedBefore = currentNoteKey;
    const keepSelectionId =
      selectedBefore && isInSubtree(selectedBefore, noteId) ? selectedBefore : null;

    const wasSelected = currentNoteKey === noteId;
    recoverFromTrash(noteId);
    li.remove();

    const restoredElement = createNotebookElement(noteData.title, noteId);
    rebuildNoteTree(noteId, restoredElement);

    const trashNotebook = document.getElementById(TRASH_ID);
    noteList.insertBefore(restoredElement, trashNotebook || null);

    ensureTrashAtBottom();

    // Re-apply open/closed state after the tree is rebuilt.
    applyOpenStateToDom(restoredElement, openState);

    const idToSelect = keepSelectionId || (wasSelected ? noteId : null);
    if (idToSelect) {
      // After restore, ensure selection stays on the same note (even if it moved out of Trash)
      const selectedLi = document.querySelector(`li[data-note-id="${idToSelect}"]`);
      const header = selectedLi ? selectedLi.querySelector('.note-header') : null;
      setActiveHeader(header || null);
      selectNote(idToSelect);
    }
    saveAppDataDebounced();
  });

  const permanentDeleteBtn = document.createElement('button');
  // replace '-' text with accessible inline SVG trash icon for permanent delete
  permanentDeleteBtn.innerHTML = '<span class="visually-hidden">Delete Permanently</span>' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="3 6 5 6 21 6"></polyline>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '</svg>';
  permanentDeleteBtn.title = "Delete Permanently";
  permanentDeleteBtn.className = "trash-btn";
  permanentDeleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    if (!notesData[noteId]) {
      li.remove();
      ensureTrashAtBottom();
      return;
    }

    deleteModalTitle.textContent = `Are you sure you want to permanently delete "${note.title}"?`;
    deleteModalBg.classList.add('show');
    const confirmed = await new Promise((resolve) => { deleteModalResolve = resolve; });
    if (!confirmed) return;

    li.remove();

    if (currentNoteKey === noteId) {
      currentNoteKey = null;
      setActiveHeader(null);
      updateNoteContentEditable();
    }

    permanentlyDelete(noteId);
    ensureTrashAtBottom();

    const trashNotebook = document.getElementById(TRASH_ID);
    if (trashNotebook && trashNotebook.querySelector('.notes').children.length === 0) {
      trashNotebook.remove();
    }
    saveAppDataDebounced();
  });

  actions.appendChild(recoverBtn);
  actions.appendChild(permanentDeleteBtn);

  const header = document.createElement('div');
  header.classList.add('note-header');
  header.appendChild(leftGroup);
  header.appendChild(actions);

  // Make trashed header keyboard-focusable but don't intercept button events
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.addEventListener('keydown', function(e) {
    if (e.target.closest && (e.target.closest('.actions') || e.target.tagName === 'BUTTON')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });

  // --- ADDED: allow clicking a trashed item's header to view it in the preview (read-only) ---
  header.addEventListener('click', function(e) {
    // don't react to clicks on action buttons or the arrow
    if (
      e.target.closest('.actions') ||
      e.target.tagName === 'BUTTON' ||
      e.target.classList.contains('arrow')
    ) return;
    setActiveHeader(header);
    selectNote(noteId);
  });

  li.appendChild(header);

  const notesList = document.createElement('ul');
  notesList.classList.add('notes');
  li.appendChild(notesList);

  const syncTrashedChildUI = () => {
    const count = notesList.children.length;
    if (count > 0) {
      subCount.textContent = `(${count})`;
      subCount.style.display = '';
      arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      arrow.style.visibility = 'visible';
      arrow.style.pointerEvents = 'auto';
      arrow.style.cursor = 'pointer';
      arrow.tabIndex = 0;
      arrow.onclick = function(e) {
        e.stopPropagation();
        toggleNotes(arrow);
        arrow.textContent = li.classList.contains('open') ? '▼' : '▶';
      };
    } else {
      subCount.textContent = '';
      subCount.style.display = 'none';
      arrow.textContent = '';
      arrow.style.visibility = 'hidden';
      arrow.style.pointerEvents = 'none';
      arrow.style.cursor = '';
      arrow.tabIndex = -1;
      arrow.onclick = null;
      li.classList.remove('open');
    }
  };

  const trashedObserver = new MutationObserver(syncTrashedChildUI);
  trashedObserver.observe(notesList, { childList: true });

  Object.keys(notesData).forEach((childId) => {
    if (notesData[childId]?.parent === noteId && notesData[childId].inTrash) {
      const childEl = createTrashedElement(childId);
      if (childEl) notesList.appendChild(childEl);
    }
  });

  syncTrashedChildUI();
  return li;
}

const originalCreateNotebookElement = createNotebookElement;
createNotebookElement = function(notebookName, existingId = null) {
  return originalCreateNotebookElement(notebookName, existingId);
};

const originalCreateNoteElement = createNoteElement;
createNoteElement = function(noteName, parentNotebookId, existingId = null) {
  return originalCreateNoteElement(noteName, parentNotebookId, existingId);
};

function ensureTrashAtBottom() {
  let hasTrashItems = false;
  const trashedItems = [];

  for (const id in notesData) {
    if (notesData[id] && notesData[id].inTrash) {
      hasTrashItems = true;
      trashedItems.push(id);
    }
  }

  let trashNotebook = document.getElementById(TRASH_ID);

  if (!hasTrashItems) {
    if (trashNotebook) trashNotebook.remove();
    if (notesData[TRASH_ID]) delete notesData[TRASH_ID];
    if (currentNoteKey === TRASH_ID || (currentNoteKey && notesData[currentNoteKey]?.inTrash)) {
      currentNoteKey = null;
      setActiveHeader(null);
      updateNoteContentEditable();
    }
    return;
  }

  if (!trashNotebook) {
    trashNotebook = createTrashNotebook();
    noteList.appendChild(trashNotebook);
  } else {
    trashNotebook.remove();
    noteList.appendChild(trashNotebook);
  }

  const trashNotesList = trashNotebook.querySelector('.notes');
  trashNotesList.innerHTML = '';
  trashedItems
    .filter(id => notesData[id]?.parent === TRASH_ID)
    .sort((a, b) => (notesData[b]?.trashedAt || 0) - (notesData[a]?.trashedAt || 0))
    .forEach(id => {
      const trashedElement = createTrashedElement(id);
      if (trashedElement) trashNotesList.appendChild(trashedElement);
    });
}

window.addEventListener('load', function() {
  ensureTrashAtBottom();
});

document.addEventListener('wheel', function(e) {
  if (
    mathSymbolsModalBg.classList.contains('show') &&
    !mathSymbolsDialog.contains(e.target)
  ) {
    const scrollable = mathSymbolsDialog.querySelector('.math-symbols-modal-content-scroll');
    if (scrollable) {
      scrollable.scrollTop += e.deltaY;
      e.preventDefault();
    }
  }
}, { passive: false });

markdownInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const value = markdownInput.value;
    const selStart = markdownInput.selectionStart;
    const selEnd = markdownInput.selectionEnd;

    const before = value.slice(0, selStart);
    const after = value.slice(selEnd);
    const lastLineBreak = before.lastIndexOf('\n');
    const lineStart = lastLineBreak + 1;
    const currentLine = before.slice(lineStart);

    const bulletRegex = /^(\s*)([-*+]|(\d+)\.)\s(\[[x ]\]\s)?/;
    const match = currentLine.match(bulletRegex);

    if (match) {
      e.preventDefault();

      const [fullMatch, indent, , numberedBullet] = match;

      if (currentLine.trim() === fullMatch.trim()) {
        markdownInput.value = before.slice(0, lineStart) + after;
        markdownInput.selectionStart = markdownInput.selectionEnd = lineStart;
      } else {
        let newBullet = match[0];
        if (numberedBullet) {
          const num = parseInt(numberedBullet, 10) + 1;
          const checkboxPart = match[4] || '';
          newBullet = `${indent}${num}. ${checkboxPart}`;
        }
        const insert = '\n' + newBullet;
        const newValue = before + insert + after;
        markdownInput.value = newValue;
        markdownInput.selectionStart = markdownInput.selectionEnd = selStart + insert.length;
      }

      renderMarkdownWithMath(markdownInput.value);
      if (currentNoteKey && notesData[currentNoteKey] && !isNoteOrAncestorDeleted(currentNoteKey)) {
        notesData[currentNoteKey].content = markdownInput.value;
      }
      saveAppDataDebounced();
    }
  }
});

// --- Custom Background Modal Logic ---
const customBgModal = document.getElementById('customBgModal');
const customBgHex = document.getElementById('customBgHex');
const customBgSwatch = document.getElementById('customBgSwatch');
const customBgOkBtn = document.getElementById('customBgOkBtn');
const customBgCancelBtn = document.getElementById('customBgCancelBtn');

function updateCustomBgOkButtonState(normalizedValue) {
  const normalized = normalizedValue === undefined ? normalizeHex(customBgHex.value) : normalizedValue;
  const disabled = !normalized;
  customBgOkBtn.disabled = disabled;
  customBgOkBtn.style.cursor = disabled ? 'not-allowed' : '';
}

function normalizeHex(hex) {
  let h = (hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null;
  return '#' + h.toUpperCase();
}
function showCustomBgModal(initialHex = '#5A6E7F') {
  closeAllModals();
  const normalized = normalizeHex(initialHex) || '#5A6E7F';
  customBgHex.value = normalized;
  customBgSwatch.style.backgroundColor = normalized;
  customBgSwatch.classList.remove('invalid');
  updateCustomBgOkButtonState(normalized);
  customBgModal.classList.add('show');
  // Focus immediately (no 100ms timeout)
  focusAndPlaceCaretEnd(customBgHex);

  const enable = isNoteSelectedAndEditable();
  customTableInsertBtn.disabled = !enable;
  customTableInsertBtn.style.cursor = enable ? '' : 'not-allowed';
}
function closeCustomBgModal() {
  customBgModal.classList.remove('show');
}
function isValidHex(hex) {
  return normalizeHex(hex) !== null;
}

customBgHex.addEventListener('input', function() {
  let val = this.value.trim();
  if (!val.startsWith('#')) val = '#' + val.replace(/^#+/, '');
  if (val === '' || val === '#') {
    this.value = '#';
  } else {
    this.value = '#' + val.slice(1).replace(/#/g, '');
  }
  customBgSwatch.classList.remove('invalid');
  const normalized = normalizeHex(this.value);
  if (normalized) {
    customBgSwatch.style.backgroundColor = normalized;
    customBgSwatch.classList.remove('invalid');
  } else {
    customBgSwatch.style.backgroundColor = '';
    customBgSwatch.classList.add('invalid');
  }
  updateCustomBgOkButtonState(normalized);
  // ...existing code...
});
customBgHex.addEventListener('keydown', function(e) {
  if ((e.key === 'Backspace' && this.selectionStart <= 1) ||
      (e.key === 'ArrowLeft' && this.selectionStart <= 1)) {
    e.preventDefault();
    this.setSelectionRange(1, 1);
  }
  if (e.key === 'Delete' && this.selectionStart === 0) {
    e.preventDefault();
    this.setSelectionRange(1, 1);
  }
});
customBgOkBtn.onclick = () => {
  if (customBgOkBtn.disabled) return;
  const normalized = normalizeHex(customBgHex.value);
  if (normalized) {
    document.body.style.backgroundColor = normalized;
    localStorage.setItem('background-color', normalized.replace(/^#/, ''));
    customBgSwatch.style.backgroundColor = normalized;
    customBgSwatch.classList.remove('invalid');
    updateCustomBgOkButtonState(normalized);
    closeCustomBgModal();
  } else {
    customBgSwatch.style.backgroundColor = '';
    customBgSwatch.classList.add('invalid');
    updateCustomBgOkButtonState(null);
    customBgHex.focus();
    requestAnimationFrame(() => customBgHex.setSelectionRange(1, 1));
  }
};
customBgCancelBtn.onclick = closeCustomBgModal;
customBgModal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.activeElement === customBgCancelBtn) {
      customBgCancelBtn.click();
    } else if (!customBgOkBtn.disabled) {
      customBgOkBtn.click();
    }
  } else if (e.key === 'Escape') {
    closeCustomBgModal();
  }
});
if (window.api) {
  window.api.on('open-custom-background-modal', () => {
    const saved = localStorage.getItem('background-color') || '5A6E7F';
    showCustomBgModal('#' + saved);
  });
}

// --- CUSTOM TABLE INSERTION LOGIC ---
const customTableModalBg = document.getElementById('customTableModalBg');
const customTableRows = document.getElementById('customTableRows');
const customTableCols = document.getElementById('customTableCols');
const customTableCells = document.getElementById('customTableCells');
const customTableInsertBtn = document.getElementById('customTableInsertBtn');
const customTableCancelBtn = document.getElementById('customTableCancelBtn');

// Reset custom table modal back to its default 2x2, empty state
function resetCustomTableModalState() {
  if (!customTableRows || !customTableCols || !customTableCells) return;
  customTableRows.value = 2;
  customTableCols.value = 2;
  customTableCells.innerHTML = '';
}

// --- added helper so focus always lands at the end (no full-selection flash) ---
function attachEndCaret(input) {
  if (!input) return;
  const isNumber = input.type === 'number';
  const placeAtEnd = (instant = false) => {
    const apply = () => {
      const value = input.value ?? '';
      try {
        if (isNumber) {
          const restore = value;
          input.value = '';
          input.value = restore;
        } else if (typeof input.setSelectionRange === 'function') {
          input.setSelectionRange(value.length, value.length);
          input.scrollLeft = input.scrollWidth;
        } else {
          input.value = '';
          input.value = value;
        }
      } catch (e) {
        input.value = '';
        input.value = value;
      }
    };
    if (instant) {
      apply();
      if (!isNumber) requestAnimationFrame(apply);
    } else {
      setTimeout(apply, 0);
    }
  };
  input.addEventListener('focus', () => placeAtEnd(true));
  input.addEventListener('mousedown', () => placeAtEnd(), { passive: true });
  input.addEventListener('touchstart', () => placeAtEnd(), { passive: true });
  input.addEventListener('mouseup', (ev) => {
    setTimeout(() => {
      try {
        if (input.selectionStart === 0 && input.selectionEnd === (input.value || '').length) {
          ev.preventDefault();
          placeAtEnd(true);
        }
      } catch (e) {
        placeAtEnd(true);
      }
    }, 0);
  });
}

attachEndCaret(customTableRows);
attachEndCaret(customTableCols);

function showCustomTableModal() {
  closeAllModals();
  renderCustomTableInputs();
  customTableModalBg.classList.add('show');
  // Focus immediately (no 100ms timeout)
  focusAndPlaceCaretEnd(customTableRows);

  const enable = isNoteSelectedAndEditable();
  customTableInsertBtn.disabled = !enable;
  customTableInsertBtn.style.cursor = enable ? '' : 'not-allowed';
}
function closeCustomTableModal() {
  // When the user leaves the modal (Insert/Cancel/Escape), reset it
  resetCustomTableModalState();
  customTableModalBg.classList.remove('show');
}

function renderCustomTableInputs() {
  const rows = Math.max(1, Math.min(20, parseInt(customTableRows.value, 10) || 2));
  const cols = Math.max(1, Math.min(10, parseInt(customTableCols.value, 10) || 2));

  // Preserve any existing cell values before rebuilding the grid
  const existingValues = [];
  const existingInputs = customTableCells.querySelectorAll('.custom-table-input');
  existingInputs.forEach((input) => {
    const r = parseInt(input.getAttribute('data-row'), 10);
    const c = parseInt(input.getAttribute('data-col'), 10);
    if (!Number.isNaN(r) && !Number.isNaN(c)) {
      if (!existingValues[r]) existingValues[r] = [];
      existingValues[r][c] = input.value;
    }
  });

  const tableEl = document.createElement('table');

  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');

    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'custom-table-input';
      input.setAttribute('data-row', String(r));
      input.setAttribute('data-col', String(c));
      if (r === 0) {
        input.placeholder = 'Header';
      }

      // Restore existing value if present for this row/column
      if (existingValues[r] && typeof existingValues[r][c] === 'string') {
        input.value = existingValues[r][c];
      }

      td.appendChild(input);
      tr.appendChild(td);
    }

    tableEl.appendChild(tr);
  }

  // Replace the contents with the newly built table
  customTableCells.innerHTML = '';
  customTableCells.appendChild(tableEl);

  // Reattach caret behavior to all inputs
  customTableCells.querySelectorAll('.custom-table-input').forEach(attachEndCaret);
}

function generateTableMarkdown(rows, cols, inputs) {
  const table = Array.from({length: rows}, () => Array(cols).fill(''));
  inputs.forEach(input => {
    const r = parseInt(input.getAttribute('data-row'), 10);
    const c = parseInt(input.getAttribute('data-col'), 10);
    // Use only what the user typed; do not inject default header text into the markdown
    table[r][c] = input.value || '';
  });

  let md = '';
  // Header row: if a cell is empty, leave it blank in the markdown
  md += '| ' + table[0].map(cell => cell || '').join(' | ') + ' |\n';
  md += '| ' + Array(cols).fill('---').join(' | ') + ' |\n';
  for (let r = 1; r < rows; r++) {
    md += '| ' + table[r].map(cell => cell || '').join(' | ') + ' |\n';
  }
  return md;
}

function insertTextAtCursor(textToInsert) {
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const value = markdownInput.value;

  const needsLineBreakBefore = start > 0 && value.charAt(start - 1) !== '\n';
  const needsLineBreakAfter = end < value.length && value.charAt(end) !== '\n';

  const insertText = (needsLineBreakBefore ? '\n\n' : '') +
                     textToInsert +
                     (needsLineBreakAfter ? '\n' : '');

  markdownInput.value = value.substring(0, start) + insertText + value.substring(end);
  markdownInput.selectionStart = markdownInput.selectionEnd = start + insertText.length;
  markdownInput.focus();
  renderMarkdownWithMathDebounced(markdownInput.value);
  if (currentNoteKey && notesData[currentNoteKey] && !isNoteOrAncestorDeleted(currentNoteKey)) {
    notesData[currentNoteKey].content = markdownInput.value;
  }
  saveAppDataDebounced();
}

customTableInsertBtn.onclick = function() {
  const rows = Math.max(1, Math.min(20, parseInt(customTableRows.value, 10) || 2));
  const cols = Math.max(1, Math.min(10, parseInt(customTableCols.value, 10) || 2));
  const inputs = customTableCells.querySelectorAll('input');
  const md = generateTableMarkdown(rows, cols, inputs);
  if (!markdownInput.readOnly) {
    insertTextAtCursor(md);
  }
  closeCustomTableModal();
};

customTableCancelBtn.onclick = closeCustomTableModal;
customTableModalBg.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeCustomTableModal();
  // If Enter pressed and focus is on Cancel, activate Cancel; otherwise Insert if enabled
  if (e.key === 'Enter') {
    if (document.activeElement === customTableCancelBtn) {
      customTableCancelBtn.click();
    } else if (!customTableInsertBtn.disabled) {
      customTableInsertBtn.click();
    }
  }
});

['input', 'change'].forEach(evt => {
  customTableRows.addEventListener(evt, renderCustomTableInputs);
  customTableCols.addEventListener(evt, renderCustomTableInputs);
});

if (window.api) {
  window.api.on('menu-insert-custom-table', () => {
    showCustomTableModal();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;

  const openModal = document.querySelector('.modal-bg.show, .math-symbols-modal-bg.show');
  if (!openModal) return;

  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
  const focusable = Array.from(openModal.querySelectorAll(focusableSelector))
    .filter(el => getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');

  if (focusable.length === 0) return;

  const firstEl = focusable[0];
  const lastEl = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === firstEl) {
    e.preventDefault();
    lastEl.focus();
  } else if (!e.shiftKey && document.activeElement === lastEl) {
    e.preventDefault();
    firstEl.focus();
  } else if (!focusable.includes(document.activeElement)) {
    e.preventDefault();
    firstEl.focus();
  }
});

// --- IMPORT/EXPORT HELPERS AND IPC ---
// Auto-save helpers
let suppressAutoSave = false;
let __saveTimer = null;

function __getIpc() {
  if (window.api && typeof window.api.invoke === 'function') {
    return { invoke: window.api.invoke };
  }
  return null;
}

async function saveAppDataImmediate() {
  if (suppressAutoSave) return;
  const ipc = __getIpc();
  if (!ipc) return;
  try {
    snapshotChildOrderFromDom();
    const orderSnapshot = {};
    Object.keys(childOrderMap).forEach((key) => {
      orderSnapshot[key] = childOrderMap[key] ? childOrderMap[key].slice() : [];
    });
    const payload = { notesData, noteIdCounter, noteOrder: orderSnapshot };
    await ipc.invoke('save-data', payload);
  } catch (e) {
    console.error('Auto-save failed:', e);
  }
}

function saveAppDataDebounced() {
  if (suppressAutoSave) return;
  if (__saveTimer) clearTimeout(__saveTimer);
  __saveTimer = setTimeout(saveAppDataImmediate, 400);
}

// Flush pending saves when the window is closing
window.addEventListener('beforeunload', () => {
  if (__saveTimer) {
    clearTimeout(__saveTimer);
    __saveTimer = null;
  }
  // Flush immediately (synchronous call, but save itself is async - Electron will wait for pending IPC)
  saveAppDataImmediate();
});

function getSelectableNoteIds() {
  return Object.keys(notesData).filter(id => notesData[id] && !notesData[id].inTrash && id !== TRASH_ID);
}

function createExportCheckbox(noteId) {
  const label = document.createElement('label');
  label.classList.add('export-checkbox');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.click();
    }
  });
  input.dataset.noteId = noteId;
  const stored = exportSelectionMap.has(noteId)
    ? exportSelectionMap.get(noteId)
    : DEFAULT_EXPORT_SELECTION;
  exportSelectionMap.set(noteId, stored);
  input.checked = stored;
  input.setAttribute('aria-label', 'Include this note in the export');
  input.addEventListener('change', () => {
    selectNoteAndDescendantsForExport(noteId, input.checked);
    updateExportSelectAllState();
    updateExportConfirmButtonState();
  });
  label.appendChild(input);
  const srText = document.createElement('span');
  srText.className = 'visually-hidden';
  srText.textContent = 'Include in export';
  label.appendChild(srText);
  exportCheckboxInputs.set(noteId, input);
  return label;
}

function updateExportSelectAllState() {
  if (!exportInlineSelectAll) return;
  const ids = getSelectableNoteIds();
  const total = ids.length;
  if (total === 0) {
    exportInlineSelectAll.checked = false;
    exportInlineSelectAll.indeterminate = false;
    return;
  }
  const checkedCount = ids.reduce((acc, id) => acc + (exportSelectionMap.get(id) ? 1 : 0), 0);
  exportInlineSelectAll.checked = checkedCount === total;
  exportInlineSelectAll.indeterminate = checkedCount > 0 && checkedCount < total;
}

function updateExportConfirmButtonState() {
  if (!exportInlineConfirm) return;
  const hasSelection = getSelectableNoteIds().some(id => !!exportSelectionMap.get(id));
  exportInlineConfirm.disabled = !hasSelection;
  exportInlineConfirm.style.cursor = hasSelection ? '' : 'not-allowed';
}

function setAllExportSelections(checked) {
  getSelectableNoteIds().forEach(id => {
    exportSelectionMap.set(id, checked);
    const input = exportCheckboxInputs.get(id);
    if (input) {
      input.checked = checked;
    }
  });
  if (exportInlineSelectAll) {
    exportInlineSelectAll.checked = checked;
    exportInlineSelectAll.indeterminate = false;
  }
  updateExportConfirmButtonState();
}

function selectNoteAndDescendantsForExport(noteId, checked) {
  const ids = new Set([noteId]);
  collectAllDescendants(noteId, ids);
  ids.forEach((id) => {
    exportSelectionMap.set(id, checked);
    const input = exportCheckboxInputs.get(id);
    if (input) {
      input.checked = checked;
    }
  });
}

function ensureSelectableSelectionStates() {
  getSelectableNoteIds().forEach(id => {
    const stored = exportSelectionMap.has(id)
      ? exportSelectionMap.get(id)
      : DEFAULT_EXPORT_SELECTION;
    exportSelectionMap.set(id, stored);
    const input = exportCheckboxInputs.get(id);
    if (input) {
      input.checked = stored;
    }
  });
}

function cleanupExportTracking(noteId) {
  exportSelectionMap.delete(noteId);
  exportCheckboxInputs.delete(noteId);
}

function enterExportMode() {
  if (exportModeActive) return;
  exportModeActive = true;
  if (sidebar) sidebar.classList.add('export-mode');
  if (exportToolbar) exportToolbar.hidden = false;
  if (exportSelectRow) exportSelectRow.hidden = false;
  ensureSelectableSelectionStates();
  updateExportSelectAllState();
  updateExportConfirmButtonState();
}

function exitExportMode() {
  if (!exportModeActive) return;
  exportModeActive = false;
  if (sidebar) sidebar.classList.remove('export-mode');
  if (exportToolbar) exportToolbar.hidden = true;
  if (exportSelectRow) exportSelectRow.hidden = true;
  if (exportInlineSelectAll) {
    exportInlineSelectAll.checked = false;
    exportInlineSelectAll.indeterminate = false;
  }
  if (exportInlineConfirm) {
    exportInlineConfirm.disabled = true;
    exportInlineConfirm.style.cursor = 'not-allowed';
  }
}

async function handleExportConfirm() {
  if (!exportModeActive) return;
  const selected = new Set();
  getSelectableNoteIds().forEach(id => {
    if (exportSelectionMap.get(id)) {
      selected.add(id);
      collectAllDescendants(id, selected);
    }
  });
  if (selected.size === 0) return;

  const filtered = {};
  selected.forEach((id) => {
    const node = notesData[id];
    if (!node) return;
    const copy = JSON.parse(JSON.stringify(node));
    if (!selected.has(copy.parent)) {
      copy.parent = null;
    }
    filtered[id] = copy;
  });

  const filteredOrder = {};
  Object.entries(childOrderMap || {}).forEach(([parentKey, order]) => {
    if (!Array.isArray(order)) return;
    const preservedIds = order.filter(id => selected.has(id));
    if (preservedIds.length === 0) return;
    const orderKey = parentKey === ROOT_ORDER_KEY || selected.has(parentKey)
      ? parentKey
      : ROOT_ORDER_KEY;
    if (!filteredOrder[orderKey]) {
      filteredOrder[orderKey] = [];
    }
    filteredOrder[orderKey].push(...preservedIds);
  });

  const ipc = __getIpc();
  if (!ipc) return;
  try {
    const payload = {
      notesData: filtered,
      noteIdCounter,
      noteOrder: filteredOrder,
      notesOrder: filteredOrder,
    };
    const res = await ipc.invoke('export-notes', payload);
    if (!res?.success) {
      console.error('Export failed:', res?.error);
    } else {
      exitExportMode();
    }
  } catch (e) {
    console.error('Export failed:', e);
  }
}

document.addEventListener('keydown', (e) => {
  if (exportModeActive && e.key === 'Escape') {
    exitExportMode();
  }
});

if (exportInlineSelectAll) {
  exportInlineSelectAll.addEventListener('change', () => {
    setAllExportSelections(!!exportInlineSelectAll.checked);
  });
  exportInlineSelectAll.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      exportInlineSelectAll.click();
    }
  });
}

if (exportInlineConfirm) {
  exportInlineConfirm.addEventListener('click', handleExportConfirm);
}

if (exportInlineCancel) {
  exportInlineCancel.addEventListener('click', exitExportMode);
}

exitExportMode();

function listChildrenIds(parentId) {
  const ids = [];
  for (const id in notesData) {
    const n = notesData[id];
    if (!n || n.inTrash || id === TRASH_ID) continue;
    if (n.parent === parentId) ids.push(id);
  }
  return ids;
}

function collectAllDescendants(id, set) {
  const children = listChildrenIds(id);
  for (const c of children) {
    if (!set.has(c)) {
      set.add(c);
      collectAllDescendants(c, set);
    }
  }
}

function rebuildFromData() {
  try {
    if (typeof setActiveHeader === 'function') setActiveHeader(null);
  } catch (e) { /* ignore */ }
  currentNoteKey = null;
  exportSelectionMap.clear();
  exportCheckboxInputs.clear();

  // Clear current sidebar list
  try {
    if (typeof noteList !== 'undefined' && noteList && noteList.innerHTML !== undefined) {
      noteList.innerHTML = '';
    } else {
      const nl = document.getElementById('noteList');
      if (nl) nl.innerHTML = '';
    }
  } catch (e) { /* ignore */ }

  if (!childOrderMap[ROOT_ORDER_KEY] || childOrderMap[ROOT_ORDER_KEY].length === 0) {
    rebuildOrderFromNotesData();
  }
  const rootIds = getOrderedChildren(null);
  rootIds.forEach((id) => {
    const node = notesData[id];
    if (!node || node.inTrash) return;
    if (node.parent === null) {
      const el = createNotebookElement(node.title, id);
      (typeof noteList !== 'undefined' && noteList ? noteList : document.getElementById('noteList')).appendChild(el);
      rebuildNoteTree(id, el);
    }
  });

  ensureTrashAtBottom();
  updateNoteContentEditable();
  if (exportModeActive) {
    ensureSelectableSelectionStates();
    updateExportSelectAllState();
    updateExportConfirmButtonState();
  }
}

if (window.api) {
  // Triggered from main menu: Export
  window.api.on('menu-export', () => {
    enterExportMode();
  });

  // Triggered from main menu: Import
  window.api.on('menu-import', async () => {
    try {
      const res = await window.api.invoke('import-notes');
      if (!res?.success) {
        console.error('Import failed:', res?.error);
        return;
      }

      const payload = res.data;
      if (!payload) return;

      const importedNotes = payload.notesData || payload;
      if (!importedNotes || Object.keys(importedNotes).length === 0) return;

      const previousSelection = currentNoteKey;
      suppressAutoSave = true;

      const allocateId = (() => {
        const occupied = new Set(Object.keys(notesData));
        return (preferredId) => {
          let finalId = preferredId;
          if (!finalId || occupied.has(finalId)) {
            finalId = generateNoteId();
          } else {
            const match = String(finalId).match(/^note-(\d+)$/);
            if (match) {
              noteIdCounter = Math.max(noteIdCounter, parseInt(match[1], 10) + 1);
            }
          }
          occupied.add(finalId);
          return finalId;
        };
      })();

      const idRemap = new Map();
      Object.keys(importedNotes).forEach((oldId) => {
        idRemap.set(oldId, allocateId(oldId));
      });
      const importedRootIds = [];

      Object.entries(importedNotes).forEach(([oldId, node]) => {
        const clone = JSON.parse(JSON.stringify(node));
        const originalParent = clone.parent;
        if (originalParent && idRemap.has(originalParent)) {
          clone.parent = idRemap.get(originalParent);
        } else if (!notesData[originalParent]) {
          clone.parent = null;
        }
        const newId = idRemap.get(oldId);
        notesData[newId] = clone;
        if (!clone.parent) {
          importedRootIds.push(newId);
        }
      });

      if (typeof payload.noteIdCounter === 'number') {
        noteIdCounter = Math.max(noteIdCounter, payload.noteIdCounter);
      }

      suppressAutoSave = false;
      const importedOrder = payload.noteOrder || payload.notesOrder;
      const preservedOrderMap = JSON.parse(JSON.stringify(childOrderMap || {}));
      if (!preservedOrderMap[ROOT_ORDER_KEY]) {
        preservedOrderMap[ROOT_ORDER_KEY] = [];
      }
      const updatedOrderMap = preservedOrderMap;
      const appendIdsToParent = (parentKey, ids) => {
        if (!updatedOrderMap[parentKey]) {
          updatedOrderMap[parentKey] = [];
        }
        const uniques = [];
        const seen = new Set();
        ids.forEach((id) => {
          if (!seen.has(id)) {
            seen.add(id);
            uniques.push(id);
          }
        });
        const remaining = updatedOrderMap[parentKey].filter((existingId) => !seen.has(existingId));
        updatedOrderMap[parentKey] = [...uniques, ...remaining];
      };
      const addedFromOrder = new Set();
      if (importedOrder && typeof importedOrder === 'object') {
        Object.entries(importedOrder).forEach(([parentKey, values]) => {
          if (!Array.isArray(values)) return;
          const normalizedParent = parentKey === ROOT_ORDER_KEY
            ? ROOT_ORDER_KEY
            : normalizeParentKey(idRemap.get(parentKey) || parentKey);
          const mappedIds = values
            .map(oldId => idRemap.get(oldId))
            .filter(Boolean);
          if (mappedIds.length === 0) return;
          appendIdsToParent(normalizedParent, mappedIds);
          mappedIds.forEach(id => addedFromOrder.add(id));
        });
      }
      const importedNoteIds = Array.from(idRemap.values());
      const leftoverIds = importedNoteIds.filter(id => !addedFromOrder.has(id));
      leftoverIds.forEach((id) => {
        const parentKey = normalizeParentKey(notesData[id]?.parent);
        appendIdsToParent(parentKey, [id]);
      });
      childOrderMap = updatedOrderMap;
      // Prioritize imported root notes at top, preserving their original order from the imported file
      const importedRootSet = new Set(importedRootIds);
      const currentRootOrder = childOrderMap[ROOT_ORDER_KEY] || [];
      // Exclude imported notes and trash from remaining notes (trash always goes at bottom)
      const remainingRoot = currentRootOrder.filter(id => !importedRootSet.has(id) && id !== TRASH_ID);
      
      // Use the order from importedOrder if available, otherwise preserve the order from importedRootIds
      let orderedImportedRoot = [];
      if (importedOrder && importedOrder[ROOT_ORDER_KEY] && Array.isArray(importedOrder[ROOT_ORDER_KEY])) {
        // Map old IDs to new IDs preserving the order from importedOrder
        orderedImportedRoot = importedOrder[ROOT_ORDER_KEY]
          .map(oldId => idRemap.get(oldId))
          .filter(id => id && importedRootSet.has(id));
        // Add any imported root IDs not in the order
        importedRootIds.forEach(id => {
          if (!orderedImportedRoot.includes(id)) {
            orderedImportedRoot.push(id);
          }
        });
      } else {
        // No order data, use the order from importedRootIds
        orderedImportedRoot = importedRootIds;
      }
      
      childOrderMap[ROOT_ORDER_KEY] = [...orderedImportedRoot, ...remainingRoot];
      rebuildFromData();

      if (previousSelection && notesData[previousSelection]) {
        const prevLi = document.querySelector(`li[data-note-id="${previousSelection}"]`);
        const prevHeader = prevLi?.querySelector('.note-header');
        if (prevHeader) setActiveHeader(prevHeader);
        selectNote(previousSelection);
      }

      saveAppDataImmediate();
    } catch (e) {
      suppressAutoSave = false;
      console.error('Import failed:', e);
    }
  });
}

// --- AUTO-LOAD main.json ON STARTUP ---
if (window.api) {
  (async function() {
    try {
      const res = await window.api.invoke('load-data');
      if (res?.success && res.data) {
        const data = res.data;
        const importedNotes = data.notesData || data;
        const importedCounter = data.noteIdCounter;

        suppressAutoSave = true;
        Object.keys(notesData).forEach(k => delete notesData[k]);
        if (deletedNotes && typeof deletedNotes.clear === 'function') deletedNotes.clear();

        for (const k in importedNotes) {
          notesData[k] = importedNotes[k];
        }

        if (typeof importedCounter === 'number') {
          noteIdCounter = Math.max(noteIdCounter, importedCounter);
        } else {
          let maxNum = 0;
          for (const id in notesData) {
            const m = String(id).match(/note-(\d+)/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          }
          noteIdCounter = maxNum + 1;
        }

        const importedOrder = data.noteOrder || data.notesOrder;
        if (importedOrder) {
          hydrateChildOrderFromData(importedOrder);
        } else {
          rebuildOrderFromNotesData();
        }
        rebuildFromData();
      }
    } catch (e) {
      console.error('Auto-load failed:', e);
    } finally {
      suppressAutoSave = false;
      ensureTrashAtBottom();
      updateNoteContentEditable();
    }
  })();
}