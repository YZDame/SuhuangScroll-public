const canvas = document.querySelector('#answer-image')
const context = canvas.getContext('2d')
context.fillStyle = '#ffffff'
context.fillRect(0, 0, canvas.width, canvas.height)
context.fillStyle = '#172033'
context.font = '32px system-ui, sans-serif'
context.fillText('2 + 3 = 5', 64, 120)
context.font = '22px system-ui, sans-serif'
context.fillStyle = '#52627a'
context.fillText('synthetic answer image', 64, 180)

const status = document.querySelector('#fixture-status')
document.querySelector('#submit-button').addEventListener('click', () => {
  status.textContent = 'Synthetic submit clicked; no network request was made.'
  document.body.dataset.syntheticSubmitted = 'true'
})
document.querySelector('#next-item').addEventListener('click', () => {
  const root = document.querySelector('main')
  const nextIndex = Number(root.dataset.paperIndex || '0') + 1
  root.dataset.paperIndex = String(nextIndex)
  root.dataset.questionId = `synthetic-question-${String(nextIndex + 1).padStart(3, '0')}`
  document.querySelector('#question-title').textContent = `合成题块：第 ${nextIndex + 1} 份`
  status.textContent = 'Synthetic fixture advanced to the next item.'
})
