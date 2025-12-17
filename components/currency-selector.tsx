'use client'

import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CurrencyCode, SUPPORTED_CURRENCIES } from '@/lib/currency/types'

interface CurrencySelectorProps {
  value: CurrencyCode
  onChange: (code: CurrencyCode) => void
  className?: string
}

export function CurrencySelector({
  value,
  onChange,
  className,
}: CurrencySelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedCurrency = SUPPORTED_CURRENCIES.find(c => c.code === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors outline-none',
          className
        )}
      >
        <span>{value}</span>
        <ChevronsUpDown className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search currency..." className="h-9" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {SUPPORTED_CURRENCIES.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name}`}
                  onSelect={() => {
                    onChange(currency.code)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  <span className="font-medium w-10">{currency.code}</span>
                  <span className="text-muted-foreground text-xs truncate flex-1">
                    {currency.name}
                  </span>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      value === currency.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
