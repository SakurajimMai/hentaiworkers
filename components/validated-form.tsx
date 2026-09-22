'use client';

import { useEffect, useId, useRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Feedback = { message: HTMLSpanElement; previousInvalid: string | null };

function isField(target: EventTarget | null): target is Field {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function validationMessage(field: Field) {
  const validity = field.validity;
  if (validity.customError) return field.validationMessage;
  if (validity.valueMissing) return field instanceof HTMLSelectElement ? '请选择一项。' : '请填写此项。';
  if (validity.typeMismatch) return field instanceof HTMLInputElement && field.type === 'email' ? '请输入有效的邮箱地址。' : '请输入有效的网址。';
  if (validity.tooShort && !(field instanceof HTMLSelectElement)) return `请至少输入 ${field.minLength} 个字符。`;
  if (validity.tooLong && !(field instanceof HTMLSelectElement)) return `最多可输入 ${field.maxLength} 个字符。`;
  if (validity.patternMismatch) return field.getAttribute('title') || '请按要求填写此项。';
  if (field instanceof HTMLInputElement) {
    if (validity.rangeUnderflow) return `请输入不小于 ${field.min} 的值。`;
    if (validity.rangeOverflow) return `请输入不大于 ${field.max} 的值。`;
    if (validity.badInput) return '请输入有效的数字。';
    if (validity.stepMismatch) return `请输入符合步长 ${field.step || '1'} 的值。`;
  }
  return field.validationMessage;
}

function removeFeedback(field: Field, feedback: Feedback) {
  // Only remove our description; retain hints and server-owned errors.
  const descriptions = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== feedback.message.id);
  if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
  else field.removeAttribute('aria-describedby');
  if (feedback.previousInvalid === null) field.removeAttribute('aria-invalid');
  else field.setAttribute('aria-invalid', feedback.previousInvalid);
  feedback.message.remove();
}

/** Keeps native constraints and server actions, replacing only the browser's error bubble. */
export function ValidatedForm({
  className, onInvalidCapture, onInputCapture, onChangeCapture, onReset, ...props
}: ComponentPropsWithoutRef<'form'>) {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef(new Map<Field, Feedback>());
  const focusQueued = useRef(false);
  const sequence = useRef(0);
  const id = useId();

  function clear(field: Field) {
    const feedback = feedbackRef.current.get(field);
    if (!feedback) return;
    removeFeedback(field, feedback);
    feedbackRef.current.delete(field);
  }

  function show(field: Field) {
    let feedback = feedbackRef.current.get(field);
    if (!feedback) {
      // Server-rendered children and dynamic editors share this form. A small owned
      // sibling avoids cloning their controls or moving them out of React's tree.
      const message = document.createElement('span');
      message.id = `${id}-error-${sequence.current++}`;
      message.className = 'form-field-error';
      message.setAttribute('role', 'alert');
      feedback = { message, previousInvalid: field.getAttribute('aria-invalid') };
      feedbackRef.current.set(field, feedback);
      field.insertAdjacentElement('afterend', message);
      const descriptions = field.getAttribute('aria-describedby');
      field.setAttribute('aria-describedby', [descriptions, message.id].filter(Boolean).join(' '));
      field.setAttribute('aria-invalid', 'true');
    }
    const text = validationMessage(field);
    if (feedback.message.textContent !== text) feedback.message.textContent = text;
  }

  function update(target: EventTarget | null) {
    if (!isField(target) || !feedbackRef.current.has(target)) return;
    if (!target.willValidate || target.validity.valid) clear(target);
    else show(target);
  }

  useEffect(() => {
    const form = formRef.current;
    const feedback = feedbackRef.current;
    if (!form) return;
    // Editors can remove rows or turn a constrained control into a readonly field.
    const observer = new MutationObserver(() => {
      for (const [field, entry] of feedback) {
        if (!form.contains(field) || !field.willValidate || field.validity.valid) {
          removeFeedback(field, entry);
          feedback.delete(field);
        }
      }
    });
    observer.observe(form, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['disabled', 'readonly', 'required', 'pattern', 'min', 'max', 'step', 'value'],
    });
    return () => {
      observer.disconnect();
      for (const [field, entry] of feedback) removeFeedback(field, entry);
      feedback.clear();
    };
  }, []);

  return (
    <form
      {...props}
      ref={formRef}
      className={cn('validated-form', className)}
      onInvalidCapture={(event) => {
        event.preventDefault();
        onInvalidCapture?.(event);
        if (!isField(event.target)) return;
        show(event.target);
        if (focusQueued.current) return;
        focusQueued.current = true;
        queueMicrotask(() => {
          focusQueued.current = false;
          // One validation attempt fires invalid for every failing field. Focus in
          // DOM order once, including when requestSubmit follows a confirmation.
          const first = Array.from(formRef.current?.elements || []).find(
            (field): field is Field => isField(field) && field.willValidate && !field.validity.valid,
          );
          first?.focus();
        });
      }}
      onInputCapture={(event) => { update(event.target); onInputCapture?.(event); }}
      onChangeCapture={(event) => { update(event.target); onChangeCapture?.(event); }}
      onReset={(event) => {
        onReset?.(event);
        if (!event.defaultPrevented) for (const field of feedbackRef.current.keys()) clear(field);
      }}
    />
  );
}
