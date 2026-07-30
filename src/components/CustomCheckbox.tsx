import React from 'react'
import { Check } from 'lucide-react'

interface CustomCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  profileColor?: string
  className?: string
}

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  label,
  className = "",
  profileColor = "#3db4f2"
}) => (
  <label className={`flex items-center cursor-pointer ${className}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onChange(!checked)}
      className="opacity-0 absolute cursor-pointer w-0 h-0"
    />

    <span
      className="h-4 w-4 relative transition-all duration-100 rounded border-2"
      style={{
        backgroundColor: checked ? profileColor : '#ffffff',
        borderColor: checked ? profileColor : '#ddd'
      }}
    >
      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>

    <span className='pl-2'>{label}</span>
  </label>
)
