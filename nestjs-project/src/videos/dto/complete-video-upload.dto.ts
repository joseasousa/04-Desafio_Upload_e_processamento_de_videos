import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteVideoUploadPartDto {
  @IsInt()
  @Min(1)
  part_number: number;

  @IsString()
  etag: string;
}

export class CompleteVideoUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompleteVideoUploadPartDto)
  parts: CompleteVideoUploadPartDto[];
}
