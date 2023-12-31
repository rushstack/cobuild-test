## API Report File for "@rushstack/rush-themed-ui"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { default as React_2 } from 'react';

// @public
export const Button: ({ children, disabled, onClick }: IButtonProps) => JSX.Element;

// @public
export const Checkbox: ({ label, isChecked, onChecked }: ICheckboxProps) => JSX.Element;

// @public
export interface IButtonProps {
    // (undocumented)
    children: JSX.Element | string;
    // (undocumented)
    disabled?: boolean;
    // (undocumented)
    onClick: () => void;
}

// @public
export interface ICheckboxProps {
    // (undocumented)
    isChecked: boolean;
    // (undocumented)
    label: string;
    // (undocumented)
    onChecked: (checked: boolean) => void;
}

// @public
export interface IInputProps {
    // (undocumented)
    onChange: (e: React_2.ChangeEvent<HTMLInputElement>) => void;
    // (undocumented)
    placeholder?: string;
    // (undocumented)
    type?: string;
    // (undocumented)
    value: string;
}

// @public
export const Input: ({ value, placeholder, onChange, type }: IInputProps) => JSX.Element;

// @public
export interface IScrollAreaProps {
    // (undocumented)
    children: React_2.ReactNode;
}

// @public
export interface ITabsItem {
    // (undocumented)
    body?: React_2.ReactNode;
    // (undocumented)
    header: string;
    // (undocumented)
    value?: string;
}

// @public
export interface ITabsProps {
    // (undocumented)
    def?: string;
    // (undocumented)
    items: ITabsItem[];
    // (undocumented)
    onChange?: (value: any) => void;
    // (undocumented)
    renderChildren?: () => JSX.Element;
    // (undocumented)
    value: string;
}

// @public
export interface ITextProps {
    // (undocumented)
    bold?: boolean;
    // (undocumented)
    children: React_2.ReactNode;
    // (undocumented)
    className?: string;
    // (undocumented)
    size?: number;
    // (undocumented)
    type: TextType;
}

// @public
export const ScrollArea: ({ children }: IScrollAreaProps) => JSX.Element;

// @public
export const Tabs: ({ items, def, value, onChange, renderChildren }: ITabsProps) => JSX.Element;

// @public
const Text_2: ({ type, bold, children, className, size }: ITextProps) => JSX.Element;
export { Text_2 as Text }

// @public
export type TextType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';

```
