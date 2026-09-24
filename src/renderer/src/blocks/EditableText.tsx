import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { readPlainText, writePlainText } from '../editor/caret'

interface EditableTextProps {
  blockId: string
  value: string
  className?: string
  onInput: (text: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onFocus: () => void
}

export function EditableText({
  blockId,
  value,
  className,
  onInput,
  onKeyDown,
  onFocus
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const composing = useRef(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || composing.current) return
    if (readPlainText(element) !== value) writePlainText(element, value)
  })

  return (
    <div
      ref={ref}
      data-block-id={blockId}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      className={className}
      onInput={(event) => {
        if (!composing.current) onInput(readPlainText(event.currentTarget))
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        onInput(readPlainText(event.currentTarget))
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    />
  )
}
