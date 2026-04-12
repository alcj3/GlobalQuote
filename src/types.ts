export type Category = 'clothing' | 'food' | 'electronics' | 'home_goods' | 'other'

export interface CostInputs {
  productName: string
  category: Category
  manufacturingCost: number
  shippingCost: number
  additionalCosts: number
}
