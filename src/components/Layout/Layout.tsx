import { ReactNode } from 'react';
import { Box } from '@mui/material';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Box component='main' sx={{ flex: 1 }}>
        {children}
      </Box>
    </Box>
  );
};
