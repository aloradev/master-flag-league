import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Season } from '../../lib/types';

export function useCompetitionSeason() {
  const [selected,setSelected]=useState('');
  const options=useQuery({queryKey:['seasons'],queryFn:()=>api.get<(Season & {status:string})[]>('/seasons')});
  const base=options.data?.find(s=>s.id===selected) ?? options.data?.find(s=>s.status==='ACTIVE') ?? options.data?.[0];
  const season=useQuery({queryKey:['competition-season',base?.id],enabled:!!base,queryFn:async()=>{
    const [categories,fields]=await Promise.all([api.get<Season['categories']>('/seasons/'+base!.id+'/categories'),api.get<Season['fields']>('/seasons/'+base!.id+'/fields')]);
    return {...base!,categories,fields};
  }});
  return {season:{...season,isLoading:options.isLoading || season.isLoading,isError:options.isError || season.isError},options:options.data??[],setSelected};
}
