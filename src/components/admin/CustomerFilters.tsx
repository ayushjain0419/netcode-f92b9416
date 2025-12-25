// ============================================
// CUSTOMER SEARCH & FILTERS COMPONENT
// Search bar and filter dropdowns for admin customer list
// ============================================

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

interface CustomerFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  profileFilter: string;
  onProfileFilterChange: (value: string) => void;
}

const CustomerFilters = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  profileFilter,
  onProfileFilterChange,
}: CustomerFiltersProps) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or access code..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-input"
        />
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[140px] bg-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Profile Number Filter */}
        <Select value={profileFilter} onValueChange={onProfileFilterChange}>
          <SelectTrigger className="w-[140px] bg-input">
            <SelectValue placeholder="Profile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Profiles</SelectItem>
            <SelectItem value="1">Profile 1</SelectItem>
            <SelectItem value="2">Profile 2</SelectItem>
            <SelectItem value="3">Profile 3</SelectItem>
            <SelectItem value="4">Profile 4</SelectItem>
            <SelectItem value="5">Profile 5</SelectItem>
            <SelectItem value="none">No Profile</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default CustomerFilters;
