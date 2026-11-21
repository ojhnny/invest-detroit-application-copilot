// "Select all that apply" questions as checkboxes, as on the demo (opt-in, with data-theme="copilot").
//
// FormAssembly shows these as a <select multiple> list, which needs Ctrl/Cmd-click to pick more than
// one. We draw a checkbox for each option and keep the original list in sync, so FormAssembly still
// submits, validates and shows/hides follow-up questions exactly as before:
//   - ticking a box selects that option in the hidden list and fires the list's own "change" event;
//   - anything else that changes the list (save & resume, FormAssembly itself) updates the boxes.
// The list stays in the page (only visually hidden), so FormAssembly's required check still sees it.
// The checkboxes are ordinary page elements, so the site's translation menu translates them too.

const HIDDEN = 'idc-visually-hidden'

/**
 * @param {HTMLSelectElement} select  a <select multiple> on the FormAssembly form
 * @returns {() => void} undo: removes the checkboxes and shows the original list again
 */
export function enhanceMultiSelect(select) {
  if (!select || !select.multiple || select.dataset.idcChecks) return () => {}
  const options = [...select.options].filter((o) => o.value)
  if (!options.length) return () => {}

  const group = document.createElement('div')
  group.className = 'idc-checks'
  group.setAttribute('role', 'group')
  const label = document.getElementById(`${select.id}-L`)
  if (label) group.setAttribute('aria-labelledby', label.id)

  const boxes = options.map((option, i) => {
    const row = document.createElement('label')
    row.className = 'idc-check'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.id = `idc-${select.id}-${i}`
    box.value = option.value
    box.checked = option.selected
    const text = document.createElement('span')
    text.textContent = option.textContent.trim()
    row.append(box, text)
    group.append(row)
    box.addEventListener('change', () => {
      option.selected = box.checked
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    return { box, option }
  })

  // The list changed some other way (save & resume, FormAssembly): show the same choices.
  const sync = () => { for (const { box, option } of boxes) box.checked = option.selected }
  // Anything that tries to focus the hidden list ("Go to field", its label) lands on the first box.
  const redirect = () => boxes[0].box.focus()

  select.dataset.idcChecks = '1'
  select.classList.add(HIDDEN)
  select.setAttribute('tabindex', '-1')
  select.setAttribute('aria-hidden', 'true')
  select.addEventListener('change', sync)
  select.addEventListener('focus', redirect)
  select.after(group)

  // FormAssembly's hint explains Ctrl-clicking, which no longer applies: use the demo's wording instead.
  const hint = document.getElementById(`${select.id}-HH`)
  const originalHint = hint && /ctrl|cmd|command|multiple/i.test(hint.textContent) ? Array.from(hint.childNodes) : null
  if (originalHint) hint.textContent = 'Select all that apply.'

  return () => {
    if (originalHint) hint.replaceChildren(...originalHint)
    group.remove()
    select.removeEventListener('change', sync)
    select.removeEventListener('focus', redirect)
    select.classList.remove(HIDDEN)
    select.removeAttribute('tabindex')
    select.removeAttribute('aria-hidden')
    delete select.dataset.idcChecks
  }
}
